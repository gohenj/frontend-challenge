import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { twMerge } from 'tailwind-merge'

// shadcn/ui Button pattern, adapted to the marketplace theme.
const buttonVariants = cva('inline-flex items-center justify-center', {
  variants: { variant: { default: 'primary', secondary: '' } },
  defaultVariants: { variant: 'default' },
})
export function Button({ className, variant, ...props }: ComponentProps<'button'> & VariantProps<typeof buttonVariants>) {
  return <button data-slot="button" className={twMerge(buttonVariants({ variant }), className)} {...props} />
}
