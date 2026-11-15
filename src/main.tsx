import { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
  Link,
  redirect,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
} from "@tanstack/react-query";
import axios from "axios";
import { Button } from "./components/ui/button";
import * as Dialog from "@radix-ui/react-dialog";
import type {
  Cart,
  Catalog,
  Change,
  Nft,
  Order,
  Quote,
  Search,
  User,
  Wallet,
} from "./contracts";
import "./style.css";

const api = axios.create({
  baseURL: import.meta.env.BASE_URL + "api",
  timeout: 4500,
});
const get = <T,>(path: string, signal?: AbortSignal) =>
  api.get<T>(path, { signal }).then((r) => r.data);
const post = <T,>(path: string, body: unknown) =>
  api.post<T>(path, body).then((r) => r.data);
let io: typeof import("socket.io-client").io;
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 0 } },
});
const message = (error: unknown) =>
  axios.isAxiosError(error)
    ? (error.response?.data?.message ?? "Falha de conexão. Tente novamente.")
    : "Algo deu errado.";
const session = async () => {
  try {
    return await get<User>("/session");
  } catch (e) {
    if (axios.isAxiosError(e) && e.response?.status === 401) return null;
    throw e;
  }
};
const refresh = (...keys: string[]) =>
  Promise.all(keys.map((key) => client.invalidateQueries({ queryKey: [key] })));
const useSession = () =>
  useQuery({ queryKey: ["session"], queryFn: session, refetchInterval: 5000 });
const useResource = <T,>(key: string) => {
  const session = useSession();
  return useQuery({
    queryKey: [key, session.data?.id ?? "guest"],
    queryFn: ({ signal }) => get<T>("/" + key, signal),
    enabled: !session.isPending,
  });
};
const feedback = (error: unknown) =>
  error ? (
    <p role="alert" className="error">
      {message(error)}
    </p>
  ) : null;
function Loading() {
  return <div className="skeleton" role="status" aria-label="Carregando" />;
}
function Failure({ error, retry }: { error: unknown; retry: () => unknown }) {
  return (
    <>
      {feedback(error)}
      <button onClick={retry}>Tentar novamente</button>
    </>
  );
}
function Summary({ quote }: { quote: Quote }) {
  return (
    <dl className="summary">
      {Object.entries({
        Subtotal: quote.subtotal,
        Desconto: quote.discount,
        "Taxa de rede": quote.fee,
        Total: quote.total,
      }).map(([label, amount]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{amount} ETH</dd>
        </div>
      ))}
    </dl>
  );
}
function artUrl(index: number) {
  return import.meta.env.BASE_URL + "art/ape-" + (index % 4) + ".png";
}
function Art({ nft }: { nft: Nft }) {
  return (
    <img
      className="art"
      src={artUrl(nft.art)}
      alt=""
      width={1254}
      height={1254}
      decoding="async"
    />
  );
}
function Shell() {
  const { data: user } = useSession();
  const [notice, setNotice] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    const socket = io({ transports: ["websocket"] });
    const versions = new Map<string, number>();
    const update = (kind: string, event: Change) => {
      const key = kind + event.resource;
      if ((versions.get(key) ?? 0) >= event.version) return;
      versions.set(key, event.version);
      if (kind === "nft") {
        setNotice("Preço ou disponibilidade atualizados.");
        void refresh("nfts", "nft", "quote", "cart");
      } else void refresh("order", "quote", "cart");
    };
    socket.on("nft.updated", (event: Change) => update("nft", event));
    socket.on("order.updated", (event: Change) => update("order", event));
    socket.on("connect", () => {
      void refresh("nfts", "nft", "quote", "cart", "order");
    });
    return () => {
      socket.disconnect();
    };
  }, [user?.id]);
  const logout = useMutation({
    mutationFn: () => api.delete("/session"),
    onSuccess: async () => {
      await client.cancelQueries();
      client.removeQueries({
        predicate: (query) => query.queryKey[0] !== "session",
      });
      client.setQueryData(["session"], null);
      await navigate({ to: "/", search: defaultSearch });
    },
  });
  const demo = useMutation({
    mutationFn: (scenario: string) => post("/demo", { scenario }),
    onSuccess: async (_, scenario) => {
      if (scenario === "reset") {
        await client.cancelQueries();
        client.removeQueries({
          predicate: (query) => query.queryKey[0] !== "session",
        });
        setNotice("");
        await navigate({ to: "/", search: defaultSearch });
      }
      if (
        ![
          "price",
          "stock",
          "slow",
          "variable",
          "favorite-error",
          "timeout",
          "decline",
        ].includes(scenario)
      )
        await client.invalidateQueries();
    },
  });
  return (
    <>
      <header>
        <Link to="/" search={defaultSearch} className="brand">
          KURIO
        </Link>
        <nav aria-label="Principal">
          <Link to="/" search={defaultSearch}>
            Explorar
          </Link>
          <Link to="/cart">Carrinho</Link>
          {user ? (
            <>
              <Link to="/profile">Perfil</Link>
              <button onClick={() => logout.mutate()}>Sair</button>
            </>
          ) : (
            <Link to="/login" search={{ next: "/" }}>
              Entrar
            </Link>
          )}
        </nav>
      </header>
      <main>
        {notice && <p role="status">{notice}</p>}
        {feedback(logout.error)}
        <Outlet />
      </main>
      <footer>
        <label>
          Cenário da demonstração{" "}
          <select
            defaultValue="default"
            onChange={(e) => demo.mutate(e.target.value)}
          >
            {Object.entries({
              default: "Normal",
              slow: "Lento",
              variable: "Latência variável",
              offline: "Sem conexão",
              error: "Erro 503",
              expire: "Expirar sessão",
              price: "Alterar preço",
              stock: "Esgotar NFT",
              timeout: "Timeout após pedido",
              decline: "Recusar pagamento",
              "favorite-error": "Falha em favoritos",
              reset: "Restaurar dados",
            }).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {feedback(demo.error)}
      </footer>
    </>
  );
}
const defaultSearch = {
  q: "",
  category: "",
  sort: "",
  page: 1,
  available: false,
};
const root = createRootRoute({
  component: Shell,
  notFoundComponent: () => <h1>Página não encontrada</h1>,
});
const home = createRoute({
  getParentRoute: () => root,
  path: "/",
  validateSearch: (raw: Record<string, unknown>): Search => ({
    q: typeof raw.q === "string" ? raw.q : "",
    category: typeof raw.category === "string" ? raw.category : "",
    sort: raw.sort === "price" ? "price" : "",
    available: raw.available === true,
    page:
      Number.isSafeInteger(raw.page) && Number(raw.page) > 0
        ? Number(raw.page)
        : 1,
  }),
  component: Home,
});
function Home() {
  const search = home.useSearch();
  const navigate = home.useNavigate();
  const update = (patch: Partial<Search>) =>
    navigate({ search: { ...search, page: 1, ...patch } });
  const catalog = useQuery({
    queryKey: ["nfts", search],
    queryFn: ({ signal }) =>
      get<Catalog>(
        "/nfts?" +
          new URLSearchParams(
            Object.entries(search).map(([key, value]) => [key, String(value)]),
          ),
        signal,
      ),
  });
  return (
    <>
      <section className="hero">
        <div>
          <p>Bem-vindo à Kurio</p>
          <h1>
            Seja dono do futuro
            <br />
            da arte digital
          </h1>
          <p>
            Descubra NFTs selecionados de criadores e colecione arte digital
            verificada.
          </p>
          <a className="button" href="#catalogo">
            Explorar
          </a>
        </div>
        <img
          src={artUrl(0)}
          alt="Emerald Ape com óculos verdes e jaqueta esmeralda"
          width={1254}
          height={1254}
          fetchPriority="high"
        />
      </section>
      <section id="catalogo">
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            void update({
              q: String(new FormData(e.currentTarget).get("q")).trim(),
            });
          }}
        >
          <label>
            Busca
            <input
              key={search.q}
              name="q"
              defaultValue={search.q}
              placeholder="Nome do NFT"
            />
          </label>
          <button>Buscar</button>
          <label>
            Categoria
            <select
              value={search.category}
              onChange={(e) => void update({ category: e.target.value })}
            >
              <option value="">Todas</option>
              <option>Criaturas</option>
              <option>Relíquias</option>
            </select>
          </label>
          <label>
            Ordenar
            <select
              value={search.sort}
              onChange={(e) => void update({ sort: e.target.value })}
            >
              <option value="">Destaques</option>
              <option value="price">Menor preço</option>
            </select>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={search.available}
              onChange={(e) => void update({ available: e.target.checked })}
            />{" "}
            Disponíveis
          </label>
        </form>
        <div className="catalog-results">
          <h2>Todos os NFTs</h2>
          {catalog.isPending ? (
            <Loading />
          ) : catalog.isError ? (
            <Failure error={catalog.error} retry={catalog.refetch} />
          ) : (
            <>
              {!catalog.data.items.length && <p>Nenhum NFT encontrado.</p>}
              <div className="catalog-grid">
                {catalog.data.items.map((nft) => (
                  <Link
                    className="card"
                    key={nft.id}
                    to="/nft/$id"
                    params={{ id: nft.id }}
                  >
                    <Art nft={nft} />
                    <div>
                      <small>{nft.category}</small>
                      <h3>{nft.name}</h3>
                      <strong>{nft.price} ETH</strong> ·{" "}
                      {nft.stock ? "Disponível" : "Esgotado"}
                    </div>
                  </Link>
                ))}
              </div>
              {catalog.data.pages > 1 && (
                <div className="pagination">
                  <button
                    disabled={search.page <= 1}
                    onClick={() => void update({ page: search.page - 1 })}
                  >
                    Anterior
                  </button>
                  <span>
                    Página {search.page} de {catalog.data.pages}
                  </span>
                  <button
                    disabled={search.page >= catalog.data.pages}
                    onClick={() => void update({ page: search.page + 1 })}
                  >
                    Próxima
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
}
const detail = createRoute({
  getParentRoute: () => root,
  path: "/nft/$id",
  component: Detail,
});
function Detail() {
  const { id } = detail.useParams();
  const { data: user } = useSession();
  const nft = useQuery({
    queryKey: ["nft", id],
    queryFn: ({ signal }) => get<Nft>("/nfts/" + id, signal),
  });
  const cart = useResource<Cart>("cart");
  const key = ["favorites", user?.id];
  const favorites = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => get<string[]>("/favorites", signal),
    enabled: !!user,
  });
  const favorite = useMutation({
    mutationFn: () => post<string[]>("/favorites", { id }),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<string[]>(key) ?? [];
      client.setQueryData(
        key,
        previous.includes(id)
          ? previous.filter((x) => x !== id)
          : [...previous, id],
      );
      return previous;
    },
    onError: (_, __, previous) => client.setQueryData(key, previous),
    onSettled: () => refresh("favorites"),
  });
  const add = useMutation({
    mutationFn: (quantity: number) =>
      post("/cart", {
        id,
        quantity:
          quantity + (cart.data?.lines.find((i) => i.id === id)?.quantity ?? 0),
      }),
    onSuccess: () => refresh("cart", "quote"),
  });
  if (nft.isPending) return <Loading />;
  if (nft.isError) return <Failure error={nft.error} retry={nft.refetch} />;
  const remaining =
    nft.data.stock - (cart.data?.lines.find((i) => i.id === id)?.quantity ?? 0);
  return (
    <article className="split nft-detail">
      <div className="nft-art">
        <Art nft={nft.data} />
      </div>
      <div>
        <small>Início / Coleção</small>
        <h1>{nft.data.name}</h1>
        <p>Um colecionável digital da coleção Kurio, verificado na Ethereum.</p>
        <dl className="nft-meta">
          <div>
            <dt>Edição</dt>
            <dd>Genesis</dd>
          </div>
          <div>
            <dt>ID do token</dt>
            <dd>#{id.padStart(4, "0")}</dd>
          </div>
          <div>
            <dt>Disponibilidade</dt>
            <dd>{nft.data.stock} disponíveis</dd>
          </div>
        </dl>
        <p className="price">{nft.data.price} ETH</p>
        {user ? (
          <button
            aria-pressed={favorites.data?.includes(id) ?? false}
            disabled={favorite.isPending}
            onClick={() => favorite.mutate()}
          >
            Favorito
          </button>
        ) : (
          <Link to="/login" search={{ next: location.pathname }}>
            Entre para favoritar
          </Link>
        )}
        {feedback(favorite.error)}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate(Number(new FormData(e.currentTarget).get("quantity")));
          }}
        >
          <label>
            Quantidade
            <input
              type="number"
              min="1"
              max={Math.max(1, remaining)}
              name="quantity"
              defaultValue="1"
              disabled={remaining <= 0}
            />
          </label>
          <Button disabled={add.isPending || !cart.data || remaining <= 0}>
            Adicionar ao carrinho
          </Button>
        </form>
        {feedback(add.error)}
        {add.isSuccess && (
          <p role="status">
            Adicionado. <Link to="/cart">Ver carrinho</Link>
          </p>
        )}
      </div>
    </article>
  );
}
const cartRoute = createRoute({
  getParentRoute: () => root,
  path: "/cart",
  component: CartPage,
});
function CartPage() {
  const quote = useResource<Quote>("quote");
  const edit = useMutation({
    mutationFn: (line: { id: string; quantity: number }) => post("/cart", line),
    onSuccess: () => refresh("cart", "quote"),
  });
  const coupon = useMutation({
    mutationFn: (coupon: string) => post("/quote", { coupon }),
    onSuccess: () => refresh("cart", "quote"),
  });
  if (quote.isPending) return <Loading />;
  if (quote.isError)
    return <Failure error={quote.error} retry={quote.refetch} />;
  return (
    <>
      <h1>Carrinho</h1>
      {!quote.data.items.length ? (
        <p>
          Seu carrinho está vazio.{" "}
          <Link to="/" search={defaultSearch}>
            Explorar NFTs
          </Link>
        </p>
      ) : (
        <div className="split cart-layout">
          <section aria-label="Itens do carrinho">
            <div className="cart-columns" aria-hidden="true">
              <span>NFT</span>
              <span>Preço</span>
              <span>Quantidade</span>
            </div>
            {quote.data.items.map((item) => (
              <article className="line" key={item.id}>
                <Link
                  className="purchase-item"
                  to="/nft/$id"
                  params={{ id: item.id }}
                >
                  <Art nft={item.nft} />
                  <span>{item.nft.name}</span>
                </Link>
                <span>{item.nft.price} ETH</span>
                <div>
                  <button
                    aria-label={"Diminuir " + item.nft.name}
                    disabled={item.quantity <= 1 || edit.isPending}
                    onClick={() =>
                      edit.mutate({ id: item.id, quantity: item.quantity - 1 })
                    }
                  >
                    −
                  </button>{" "}
                  {item.quantity}{" "}
                  <button
                    aria-label={"Aumentar " + item.nft.name}
                    disabled={item.quantity >= item.nft.stock || edit.isPending}
                    onClick={() =>
                      edit.mutate({ id: item.id, quantity: item.quantity + 1 })
                    }
                  >
                    +
                  </button>{" "}
                  <button
                    disabled={edit.isPending}
                    onClick={() => edit.mutate({ id: item.id, quantity: 0 })}
                  >
                    Remover
                  </button>
                </div>
                {item.quantity > item.nft.stock && (
                  <p role="alert">Quantidade indisponível.</p>
                )}
              </article>
            ))}
            {feedback(edit.error)}
          </section>
          <section className="panel purchase-summary">
            <h2>Resumo do carrinho</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                coupon.mutate(
                  String(new FormData(e.currentTarget).get("coupon")),
                );
              }}
            >
              <label>
                Cupom
                <input name="coupon" />
              </label>
              <div>
                <button disabled={coupon.isPending}>Aplicar</button>{" "}
                <button
                  type="button"
                  disabled={coupon.isPending}
                  onClick={() => coupon.mutate("")}
                >
                  Remover cupom
                </button>
              </div>
            </form>
            {feedback(coupon.error)}
            <Summary quote={quote.data} />
            <Link className="button" to="/checkout">
              Ir para pagamento
            </Link>
          </section>
        </div>
      )}
    </>
  );
}
const privateRoute = async ({ location }: { location: { href: string } }) => {
  if (!(await client.fetchQuery({ queryKey: ["session"], queryFn: session })))
    throw redirect({ to: "/login", search: { next: location.href } });
};
api.interceptors.response.use(
  (r) => r,
  (error) => {
    const path = error.config?.url;
    if (
      error.response?.status === 401 &&
      path !== "/session" &&
      path !== "/login" &&
      path !== "/register"
    ) {
      client.removeQueries({
        predicate: (q) =>
          ["favorites", "wallets", "order"].includes(String(q.queryKey[0])),
      });
      client.setQueryData(["session"], null);
      void router.navigate({
        to: "/login",
        search: { next: window.location.pathname + window.location.search },
      });
    }
    return Promise.reject(error);
  },
);
const authSearch = (raw: Record<string, unknown>) => ({
  next:
    typeof raw.next === "string" && /^\/(?![\/\\])/.test(raw.next)
      ? raw.next
      : "/",
});
const login = createRoute({
  getParentRoute: () => root,
  path: "/login",
  validateSearch: authSearch,
  component: () => <Auth />,
});
const register = createRoute({
  getParentRoute: () => root,
  path: "/register",
  validateSearch: authSearch,
  component: () => <Auth register />,
});
function Auth({ register: create }: { register?: boolean }) {
  const { next } = useNavigateSearch();
  const action = useMutation({
    mutationFn: (body: Record<string, FormDataEntryValue>) =>
      post<User>(create ? "/register" : "/login", body),
    onSuccess: async (user) => {
      await client.cancelQueries();
      client.removeQueries({
        predicate: (query) => query.queryKey[0] !== "session",
      });
      client.setQueryData(["session"], user);
      await router.navigate({ href: next });
    },
  });
  return (
    <section className="panel narrow">
      <h1>{create ? "Criar conta" : "Entrar"}</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          action.mutate(Object.fromEntries(new FormData(e.currentTarget)));
        }}
      >
        {create && (
          <label>
            Nome
            <input name="name" required autoComplete="name" />
          </label>
        )}
        <label>
          E-mail
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Senha
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={create ? "new-password" : "current-password"}
          />
        </label>
        {feedback(action.error)}
        <Button disabled={action.isPending}>
          {create ? "Cadastrar" : "Entrar"}
        </Button>
      </form>
      <p>
        <Link to={create ? "/login" : "/register"} search={{ next }}>
          {create ? "Já tenho conta" : "Criar conta"}
        </Link>
      </p>
    </section>
  );
}
function useNavigateSearch() {
  return useSearch({ strict: false }) as { next: string };
}
const checkout = createRoute({
  getParentRoute: () => root,
  path: "/checkout",
  beforeLoad: privateRoute,
  component: Checkout,
});
function Checkout() {
  const { data: user } = useSession();
  const quote = useResource<Quote>("quote");
  const wallets = useQuery({
    queryKey: ["wallets", user?.id],
    queryFn: ({ signal }) => get<Wallet>("/wallets", signal),
    enabled: !!user,
  });
  const [review, setReview] = useState<Record<string, string> | null>(null);
  const [connection, setConnection] = useState("");
  const storage = "jungle-attempt:" + user?.id;
  const [retry, setRetry] = useState<{
    key: string;
    payload: Record<string, string>;
  } | null>(null);
  useEffect(() => {
    const raw = localStorage.getItem(storage);
    setRetry(raw ? JSON.parse(raw) : null);
  }, [storage]);
  const submit = useMutation({
    mutationFn: (attempt: { key: string; payload: Record<string, string> }) =>
      api
        .post<Order>("/orders", attempt.payload, {
          headers: { "Idempotency-Key": attempt.key },
        })
        .then((r) => r.data),
    onSuccess: async (order) => {
      await router.navigate({ to: "/order/$id", params: { id: order.id } });
      localStorage.removeItem(storage);
    },
    onError: async (error) => {
      if (
        axios.isAxiosError(error) &&
        [409, 422].includes(error.response?.status ?? 0)
      ) {
        localStorage.removeItem(storage);
        setRetry(null);
        setReview(null);
        await refresh("quote");
      }
    },
  });
  if (!user)
    return (
      <Link to="/login" search={{ next: "/checkout" }}>
        Renovar sessão
      </Link>
    );
  const confirm = () => {
    if (submit.isPending) return;
    const attempt =
      retry ?? (review ? { key: crypto.randomUUID(), payload: review } : null);
    if (!attempt) return;
    localStorage.setItem(storage, JSON.stringify(attempt));
    setRetry(attempt);
    submit.mutate(attempt);
  };
  return (
    <>
      <h1>Pagamento</h1>
      {quote.isError && <Failure error={quote.error} retry={quote.refetch} />}
      {quote.isPending && <Loading />}
      {wallets.isError && (
        <Failure error={wallets.error} retry={wallets.refetch} />
      )}
      {retry && (
        <button onClick={confirm} disabled={submit.isPending}>
          Recuperar tentativa de pagamento
        </button>
      )}
      {feedback(submit.error)}
      {quote.data && (
        <div className="split checkout-layout">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setReview({
                ...Object.fromEntries(
                  [...new FormData(e.currentTarget)].map(([k, v]) => [
                    k,
                    String(v),
                  ]),
                ),
                signature: quote.data.signature,
              });
            }}
          >
            <label>
              Nome do colecionador
              <input name="name" defaultValue={user.name} required />
            </label>
            <label>
              E-mail
              <input name="email" value={user.email} readOnly />
            </label>
            <label>
              Carteira
              <select name="wallet" required onChange={() => setConnection("")}>
                <option value="">Selecione</option>
                {[wallets.data?.address, wallets.data?.secondary]
                  .filter(Boolean)
                  .map((address) => (
                    <option key={address}>{address}</option>
                  ))}
              </select>
            </label>
            <label>
              Rede
              <select name="network" onChange={() => setConnection("")}>
                <option>Ethereum</option>
                <option>Polygon</option>
              </select>
            </label>
            <div>
              <button
                type="button"
                onClick={(e) => {
                  const address = new FormData(e.currentTarget.form!).get(
                    "wallet",
                  );
                  setConnection(
                    address ? "Conectada" : "Selecione uma carteira",
                  );
                }}
              >
                Conectar carteira
              </button>{" "}
              <button
                type="button"
                onClick={() => setConnection("Conexão recusada")}
              >
                Simular recusa
              </button>{" "}
              <button
                type="button"
                onClick={() => setConnection("Desconectada")}
              >
                Desconectar
              </button>
            </div>
            <p role="status">{connection}</p>
            <Link to="/wallets">Gerenciar carteiras</Link>
            <Button
              disabled={
                !!retry ||
                !quote.data.items.length ||
                quote.data.items.some((i) => i.quantity > i.nft.stock) ||
                connection !== "Conectada"
              }
            >
              Revisar pedido
            </Button>
          </form>
          <section className="panel purchase-summary">
            <h2>Seus NFTs</h2>
            <ul className="checkout-items">
              {quote.data.items.map(({ nft, quantity }) => (
                <li className="purchase-item" key={nft.id}>
                  <Art nft={nft} />
                  <span>
                    {nft.name}
                    <small>
                      {quantity} × {nft.price} ETH
                    </small>
                  </span>
                </li>
              ))}
            </ul>
            <Summary quote={quote.data} />
          </section>
        </div>
      )}
      <Modal
        open={!!review}
        onClose={() => setReview(null)}
        title="Revisar pedido"
      >
        {quote.data && <Summary quote={quote.data} />}
        {review && (
          <p>
            {review.name} · {review.network}
          </p>
        )}
        {!retry && review?.signature !== quote.data?.signature && (
          <p role="alert">
            A cotação mudou. Feche e revise o pedido novamente.
          </p>
        )}
        {feedback(submit.error)}
        <Button
          disabled={
            submit.isPending ||
            (!retry && review?.signature !== quote.data?.signature)
          }
          onClick={confirm}
        >
          Confirmar compra
        </Button>
      </Modal>
    </>
  );
}
function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="dialog" aria-describedby={undefined}>
          <Dialog.Title>{title}</Dialog.Title>
          {children}
          <Dialog.Close asChild>
            <button>Fechar</button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
const orderRoute = createRoute({
  getParentRoute: () => root,
  path: "/order/$id",
  beforeLoad: privateRoute,
  component: Receipt,
});
function Receipt() {
  const { id } = orderRoute.useParams();
  const { data: user } = useSession();
  const order = useQuery({
    queryKey: ["order", user?.id, id],
    queryFn: ({ signal }) => get<Order>("/orders/" + id, signal),
    enabled: !!user,
    refetchInterval: (q) => (q.state.data?.status === "pending" ? 1500 : false),
  });
  if (!user)
    return (
      <Link to="/login" search={{ next: location.pathname }}>
        Renovar sessão
      </Link>
    );
  if (order.isPending) return <Loading />;
  if (order.isError)
    return <Failure error={order.error} retry={order.refetch} />;
  const { status, quote, transaction } = order.data;
  return (
    <section className="panel narrow">
      <div role="status">
        <h1>
          {
            {
              pending: "Pagamento pendente",
              declined: "Pagamento recusado",
              confirmed: "Compra confirmada",
            }[status]
          }
        </h1>
      </div>
      {status === "confirmed" && (
        <>
          <p className="break-all">Transação simulada {transaction}</p>
          <ul>
            {quote.items.map((i) => (
              <li key={i.id}>
                {i.quantity} × {i.nft.name} · {i.nft.price} ETH
              </li>
            ))}
          </ul>
          <Summary quote={quote} />
        </>
      )}
      <Link to={status === "declined" ? "/cart" : "/"} search={defaultSearch}>
        {status === "declined" ? "Voltar ao carrinho" : "Explorar NFTs"}
      </Link>
    </section>
  );
}
const profile = createRoute({
  getParentRoute: () => root,
  path: "/profile",
  beforeLoad: privateRoute,
  component: Profile,
});
const wallets = createRoute({
  getParentRoute: () => root,
  path: "/wallets",
  beforeLoad: privateRoute,
  component: Wallets,
});
function AccountMenu() {
  return (
    <aside className="account-menu">
      <h2>Meu perfil</h2>
      <nav aria-label="Minha conta">
        <Link to="/profile">Dados do perfil</Link>
        <Link to="/wallets">Carteiras</Link>
      </nav>
    </aside>
  );
}
function Profile() {
  const { data: user } = useSession();
  const action = useMutation({
    mutationFn: (data: Record<string, FormDataEntryValue>) =>
      post<User>("/profile", data),
    onSuccess: (data) => client.setQueryData(["session"], data),
  });
  if (!user)
    return (
      <Link to="/login" search={{ next: "/profile" }}>
        Renovar sessão
      </Link>
    );
  return (
    <section className="account-layout">
      <AccountMenu />
      <div className="account-content">
        <h1>Perfil</h1>
        <form
          key={user.id}
          onSubmit={(e) => {
            e.preventDefault();
            action.mutate(Object.fromEntries(new FormData(e.currentTarget)));
          }}
        >
          <label>
            Nome
            <input name="name" defaultValue={user.name} required />
          </label>
          <label>
            E-mail
            <input value={user.email} readOnly />
          </label>
          <label>
            URL do avatar
            <input type="url" name="avatar" defaultValue={user.avatar} />
          </label>
          {user.avatar && (
            <img
              className="avatar"
              src={user.avatar}
              alt="Avatar do colecionador"
            />
          )}
          <label>
            Senha atual
            <input
              type="password"
              name="previous"
              autoComplete="current-password"
            />
          </label>
          <label>
            Nova senha
            <input
              type="password"
              name="password"
              minLength={8}
              autoComplete="new-password"
            />
          </label>
          {feedback(action.error)}
          {action.isSuccess && <p role="status">Perfil salvo.</p>}
          <Button disabled={action.isPending}>Salvar perfil</Button>
        </form>
        <p>
          <Link to="/wallets">Carteiras</Link>
        </p>
      </div>
    </section>
  );
}
function Wallets() {
  const { data: user } = useSession();
  const resource = useQuery({
    queryKey: ["wallets", user?.id],
    queryFn: ({ signal }) => get<Wallet>("/wallets", signal),
    enabled: !!user,
  });
  const action = useMutation({
    mutationFn: (data: Record<string, FormDataEntryValue>) =>
      post<Wallet>("/wallets", data),
    onSuccess: () => refresh("wallets", "session"),
  });
  if (!user)
    return (
      <Link to="/login" search={{ next: "/wallets" }}>
        Renovar sessão
      </Link>
    );
  if (resource.isPending) return <Loading />;
  if (resource.isError)
    return <Failure error={resource.error} retry={resource.refetch} />;
  return (
    <section className="account-layout">
      <AccountMenu />
      <div className="account-content">
        <h1>Carteiras</h1>
        <form
          key={user.id}
          onSubmit={(e) => {
            e.preventDefault();
            action.mutate(Object.fromEntries(new FormData(e.currentTarget)));
          }}
        >
          <label>
            Carteira principal
            <input
              name="address"
              defaultValue={resource.data.address}
              required
            />
          </label>
          <label>
            Carteira secundária
            <input name="secondary" defaultValue={resource.data.secondary} />
          </label>
          {feedback(action.error)}
          {action.isSuccess && <p role="status">Carteiras salvas.</p>}
          <Button disabled={action.isPending}>Salvar carteiras</Button>
        </form>
        <p>
          <Link to="/checkout">Voltar ao pagamento</Link>
        </p>
      </div>
    </section>
  );
}
const router = createRouter({
  basepath: import.meta.env.BASE_URL,
  routeTree: root.addChildren([
    home,
    detail,
    cartRoute,
    login,
    register,
    checkout,
    orderRoute,
    profile,
    wallets,
  ]),
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

async function start() {
  if (import.meta.env.VITE_ENABLE_MOCKS !== "false") {
    const { worker } = await import("./mocks");
    await worker.start({
      serviceWorker: { url: import.meta.env.BASE_URL + "mockServiceWorker.js" },
      onUnhandledRequest: "bypass",
      quiet: true,
    });
  }
  ({ io } = await import("socket.io-client"));
  createRoot(document.getElementById("root")!).render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
void start().catch(() => {
  document.getElementById("root")!.textContent =
    "Não foi possível iniciar a demonstração. Recarregue a página.";
});
