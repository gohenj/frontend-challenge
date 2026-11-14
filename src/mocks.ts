import { delay, http, HttpResponse, ws } from 'msw'
import { setupWorker } from 'msw/browser'
import { toSocketIo } from '@mswjs/socket.io-binding'
import type { Cart, Nft, Order, Quote, User } from './contracts'

type Account = User & { hash: string; favorites: string[] }
type Purchase = { owner: string; payload: string; order: Order; due: number; decline: boolean }
const names = ['Onça Espectral','Arara Solar','Guardião do Dossel','Serpente de Jade','Jaguar Lunar','Tucano Carmesim','Orquídea Fantasma','Totem de Obsidiana','Sentinela do Rio','Lótus Selvagem','Eco da Floresta','Rastro de Âmbar']
const seed = () => ({
  nfts: names.map((name, art): Nft => ({ id: String(art + 1), name, art, category: ['Criaturas','Relíquias'][art % 2], price: '0.' + String(12 + art * 3), stock: art === 10 ? 0 : 5, version: 1 })),
  accounts: [] as Account[], session: null as null | { id: string; expires: number },
  cart: { lines: [], coupon: '' } as Cart, carts: {} as Record<string, Cart>, orders: {} as Record<string, Purchase>,
})
const key = 'jungle-marketplace-v1'
let state: ReturnType<typeof seed> = JSON.parse(localStorage.getItem(key) ?? 'null') ?? seed()
const save = () => localStorage.setItem(key, JSON.stringify(state))
let scenario = 'default'
const err = (status: number, message: string) => HttpResponse.json({ message }, { status })
const json = (data: unknown) => new HttpResponse(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
const user = () => state.session && state.session.expires > Date.now() ? state.accounts.find(a => a.id === state.session?.id) : undefined
const emptyCart = (): Cart => ({ lines: [], coupon: '' })
const cart = (id = state.session?.id) => id ? (state.carts[id] ??= emptyCart()) : state.cart
const profile = ({ id, name, email, avatar, wallet }: Account): User => ({ id, name, email, avatar, wallet })
const hash = async (email: string, password: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email + ':' + password)))).join(',')
const account = async (email: string, password: string, name: string): Promise<Account> => ({
  id: crypto.randomUUID(), email, name, hash: await hash(email, password), avatar: '', favorites: [],
  wallet: { address: '0x' + '1'.repeat(40), secondary: '' },
})
const decimal = (n: bigint) => (n / 10000n).toString() + '.' + (n % 10000n).toString().padStart(4, '0')
const units = (s: string) => { const [whole, fraction = ''] = s.split('.'); return BigInt(whole + fraction.padEnd(4, '0')) }
const quote = (): Quote => {
  const items = cart().lines.flatMap(line => { const nft = state.nfts.find(n => n.id === line.id); return nft ? [{ ...line, nft }] : [] })
  const subtotal = items.reduce((sum, item) => sum + units(item.nft.price) * BigInt(item.quantity), 0n)
  const discount = cart().coupon === 'JUNGLE10' ? subtotal / 10n : 0n
  const fee = items.length ? 50n : 0n
  return { items, subtotal: decimal(subtotal), discount: decimal(discount), fee: decimal(fee), total: decimal(subtotal - discount + fee),
    signature: JSON.stringify([cart().coupon, items.map(i => [i.id, i.quantity, i.nft.version]), decimal(subtotal - discount + fee)]) }
}
const socket = ws.link(location.origin.replace(/^http/, 'ws') + '/')
const peers = new Set<{ owner: string | undefined; emit: (event: string, data: unknown) => void }>()
const emit = (event: string, resource: string, version: number, owner?: string) => {
  for (const peer of peers) if (!owner || peer.owner === owner) peer.emit(event, { id: event + ':' + resource + ':' + version, resource, version })
}
const settle = (purchase: Purchase) => {
  const { order } = purchase
  if (order.status !== 'pending' || Date.now() < purchase.due) return
  order.status = purchase.decline ? 'declined' : 'confirmed'
  order.version++
  if (!purchase.decline) {
    for (const item of order.quote.items) {
      const nft = state.nfts.find(n => n.id === item.id)!
      nft.stock = Math.max(0, nft.stock - item.quantity)
      nft.version++
      {
        const line = cart(purchase.owner).lines.find(l => l.id === item.id)
        if (line) line.quantity -= item.quantity
      }
      emit('nft.updated', nft.id, nft.version)
    }
    cart(purchase.owner).lines = cart(purchase.owner).lines.filter(l => l.quantity > 0)
  }
  save()
  emit('order.updated', order.id, order.version, purchase.owner)
}
const api = http.all('/api/*', async ({ request }) => {
  const url = new URL(request.url)
  const path = url.pathname.slice(5)
  const method = request.method
  const body = method === 'GET' || method === 'DELETE' ? {} : await request.json() as Record<string, string | number>
  if (path === 'demo') {
    scenario = String(body.scenario)
    if (scenario === 'reset') { state = seed(); scenario = 'default'; save() }
    if (scenario === 'expire' && state.session) { state.session.expires = 0; save() }
    if (scenario === 'price' || scenario === 'stock') {
      const nft = state.nfts.find(n => n.id === cart().lines[0]?.id) ?? state.nfts[0]
      if (scenario === 'price') nft.price = decimal(units(nft.price) + 100n)
      else nft.stock = 0
      nft.version++; save(); emit('nft.updated', nft.id, nft.version)
    }
    return json({ scenario })
  }
  if (scenario === 'slow') await delay(1400)
  if (scenario === 'variable' && path === 'nfts') await delay((url.searchParams.get('q')?.length ?? 0) < 3 ? 900 : 100)
  if (scenario === 'offline') return HttpResponse.error()
  if (scenario === 'error') return err(503, 'Serviço indisponível.')
  const current = user()
  if (path === 'session' && method === 'GET') return current ? json(profile(current)) : err(401, 'Entre para continuar.')
  if (path === 'session' && method === 'DELETE') {
    state.session = null; state.cart = { lines: [], coupon: '' }; save(); return json(null)
  }
  if (path === 'login' || path === 'register') {
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const name = String(body.name ?? '').trim()
    if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) return err(422, 'Informe um e-mail válido e uma senha de 8 caracteres.')
    if (!state.accounts.length) state.accounts = await Promise.all([account('demo@jungle.test', 'jungle123', 'Alex Silva'), account('outra@jungle.test', 'jungle123', 'Marina Costa')])
    let match = state.accounts.find(a => a.email === email)
    if (path === 'register') {
      if (match) return err(409, 'E-mail já cadastrado.')
      if (!name) return err(422, 'Informe seu nome.')
      match = await account(email, password, name); state.accounts.push(match)
    }
    if (!match || match.hash !== await hash(email, password)) return err(401, 'Credenciais inválidas.')
    if (!state.session && state.cart.lines.length) { state.carts[match.id] = state.cart; state.cart = emptyCart() }
    state.session = { id: match.id, expires: Date.now() + 3600000 }; save()
    return json(profile(match))
  }
  if (path === 'nfts') {
    const p = url.searchParams
    const q = (p.get('q') ?? '').toLocaleLowerCase()
    const category = p.get('category')
    const items = state.nfts.filter(n => n.name.toLocaleLowerCase().includes(q) && (!category || n.category === category) && (p.get('available') !== 'true' || n.stock > 0))
    if (p.get('sort') === 'price') items.sort((a,b) => Number(units(a.price) - units(b.price)))
    const page = Math.max(1, Number(p.get('page')) || 1)
    return json({ items: items.slice((page - 1) * 6, page * 6), pages: Math.ceil(items.length / 6) })
  }
  if (path.startsWith('nfts/')) {
    const nft = state.nfts.find(n => n.id === path.slice(5))
    return nft ? json(nft) : err(404, 'NFT não encontrado.')
  }
  if (path === 'cart') {
    if (method !== 'GET') {
      const nft = state.nfts.find(n => n.id === body.id)
      const quantity = Number(body.quantity)
      if (!nft || !Number.isInteger(quantity) || quantity < 0 || (quantity > nft.stock && quantity !== 0)) return err(409, 'Quantidade indisponível.')
      cart().lines = cart().lines.filter(l => l.id !== nft.id)
      if (quantity) cart().lines.push({ id: nft.id, quantity })
      save()
    }
    return json(cart())
  }
  if (path === 'quote') {
    if (method !== 'GET') {
      const coupon = String(body.coupon ?? '').trim().toUpperCase()
      if (coupon && coupon !== 'JUNGLE10') return err(422, coupon === 'EXPIRED' ? 'Cupom expirado.' : 'Cupom inválido.')
      cart().coupon = coupon; save()
    }
    return json(quote())
  }
  if (!current) return err(401, 'Sua sessão precisa ser renovada.')
  if (path === 'favorites') {
    if (method !== 'GET') {
      if (scenario === 'favorite-error') return err(503, 'Não foi possível salvar o favorito.')
      const id = String(body.id)
      if (!state.nfts.some(n => n.id === id)) return err(404, 'NFT não encontrado.')
      current.favorites = current.favorites.includes(id) ? current.favorites.filter(f => f !== id) : [...current.favorites, id]
      save()
    }
    return json(current.favorites)
  }
  if (path === 'profile') {
    if (method !== 'GET') {
      if (!String(body.name ?? '').trim()) return err(422, 'Informe seu nome.')
      if (body.password) {
        if (current.hash !== await hash(current.email, String(body.previous)) || String(body.password).length < 8) return err(422, 'Confira a senha atual e informe uma nova senha com 8 caracteres.')
        current.hash = await hash(current.email, String(body.password))
      }
      current.name = String(body.name).trim(); current.avatar = String(body.avatar ?? ''); save()
    }
    return json(profile(current))
  }
  if (path === 'wallets') {
    if (method !== 'GET') {
      const address = String(body.address ?? '')
      const secondary = String(body.secondary ?? '')
      const valid = /^0x[\da-f]{40}$/i
      if (!valid.test(address) || (secondary && (!valid.test(secondary) || secondary.toLowerCase() === address.toLowerCase()))) return err(422, 'Informe endereços Ethereum válidos e distintos.')
      current.wallet = { address, secondary }; save()
    }
    return json(current.wallet)
  }
  if (path === 'orders' && method === 'POST') {
    const attempt = request.headers.get('Idempotency-Key')
    if (!attempt) return err(422, 'Tentativa sem identificação.')
    const index = current.id + ':' + attempt
    const payload = JSON.stringify(body)
    const previous = state.orders[index]
    if (previous) { settle(previous); return previous.payload === payload ? json(previous.order) : err(409, 'Tentativa já usada com outros dados.') }
    const snapshot = structuredClone(quote())
    if (snapshot.signature !== body.signature || !snapshot.items.length || snapshot.items.some(i => i.quantity > i.nft.stock)) return err(409, 'A cotação mudou. Confira o carrinho.')
    if (!body.name || body.email !== current.email || !body.wallet || ![current.wallet.address, current.wallet.secondary].includes(String(body.wallet)) || !['Ethereum','Polygon'].includes(String(body.network))) return err(422, 'Confira os dados de pagamento.')
    const purchase: Purchase = { owner: current.id, payload, due: Date.now() + 900, decline: scenario === 'decline', order: { id: crypto.randomUUID(), status: 'pending', quote: snapshot, transaction: '0x' + crypto.randomUUID().replaceAll('-', ''), version: 1 } }
    state.orders[index] = purchase; save()
    setTimeout(() => settle(purchase), 950)
    if (scenario === 'timeout') { scenario = 'default'; await delay(7000) }
    return json(purchase.order)
  }
  if (path.startsWith('orders/')) {
    const purchase = Object.values(state.orders).find(p => p.owner === current.id && p.order.id === path.slice(7))
    if (!purchase) return err(404, 'Pedido não encontrado.')
    settle(purchase); return json(purchase.order)
  }
  return err(404, 'Recurso não encontrado.')
})
export const worker = setupWorker(api, socket.addEventListener('connection', connection => {
  const io = toSocketIo(connection)
  const peer = { owner: user()?.id, emit: (event: string, data: unknown) => io.client.emit(event, data) }
  peers.add(peer)
  connection.client.addEventListener('close', () => peers.delete(peer))
}))


