import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

/*
 * Apple-style buttons (HIG › Buttons): capsule shapes, one prominent (accent)
 * style for the main action, gray and plain styles for the rest. On touch
 * screens every size grows to the 44 pt minimum (HIG › Accessibility).
 */
const buttonVariants = cva(
  "group/button pressable inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Prominent: the most likely action in a view.
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        // Bordered gray: a secondary action.
        outline: "bg-fill text-tint hover:bg-[color-mix(in_srgb,var(--fill),var(--foreground)_6%)]",
        secondary:
          "bg-fill text-foreground hover:bg-[color-mix(in_srgb,var(--fill),var(--foreground)_6%)]",
        // Plain: text in the accent colour, no background until hovered.
        ghost: "text-tint hover:bg-fill",
        destructive: "bg-fill text-destructive hover:bg-destructive/10",
        link: "text-tint underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-4 pointer-coarse:h-11 pointer-coarse:px-5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 px-2.5 text-xs pointer-coarse:h-11 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1 px-3 text-sm pointer-coarse:h-11 pointer-coarse:px-4 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 px-6 text-base pointer-coarse:h-12",
        icon: "size-9 pointer-coarse:size-11",
        "icon-xs": "size-7 pointer-coarse:size-11 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 pointer-coarse:size-11",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
