import { redirect } from 'next/navigation'

export default function HomePage() {
  // Automatically route users landing on the root URL to the application core
  redirect('/dashboard')
}