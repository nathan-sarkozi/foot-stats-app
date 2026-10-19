export interface FormState {
  status: 'idle' | 'error' | 'success'
  message: string
  fieldErrors?: Record<string, string[]>
}

export const EMPTY_FORM_STATE: FormState = { status: 'idle', message: '' }
