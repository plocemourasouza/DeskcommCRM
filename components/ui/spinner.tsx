import * as React from "react";
import { CircleNotch } from "@phosphor-icons/react/dist/ssr";

import { cn } from "@/lib/utils";

/**
 * Indicador de "estou trabalhando". Decorativo por contrato: o estado é
 * anunciado por quem o hospeda (`aria-busy` no botão, `role="status"` na
 * região), nunca pelo desenho. Por isso `aria-hidden` fixo.
 */
export type SpinnerProps = Omit<React.ComponentPropsWithoutRef<typeof CircleNotch>, "aria-hidden">;

export function Spinner({ className, ...props }: SpinnerProps) {
  return <CircleNotch aria-hidden className={cn("size-4 animate-spin", className)} {...props} />;
}
