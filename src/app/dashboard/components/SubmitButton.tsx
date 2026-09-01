'use client'

import { useFormStatus } from 'react-dom'
import { cn } from '@/utils/cn'

interface SubmitButtonProps {
  defaultLabel: string
  loadingLabel: string
  variant?: 'primary' | 'danger'
  className?: string
}

export default function SubmitButton({ defaultLabel, loadingLabel, variant = 'primary', className }: SubmitButtonProps) {
  // Le hook magique : il détecte automatiquement si le <form> parent est en cours de soumission
  const { pending } = useFormStatus()

  const baseStyles = "inline-flex justify-center items-center rounded-md border border-transparent px-4 py-2 text-sm font-medium text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
  
  const variants = {
    primary: "bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500",
    danger: "bg-red-600 hover:bg-red-700 focus:ring-red-500"
  }

  return (
    <button
      type="submit"
      disabled={pending}
      className={cn(baseStyles, variants[variant], className)}
    >
      {pending ? (
        <>
          {/* Spinner SVG animé */}
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          {loadingLabel}
        </>
      ) : (
        defaultLabel
      )}
    </button>
  )
}