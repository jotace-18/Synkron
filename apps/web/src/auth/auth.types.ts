export interface AuthSession {
  user: {
    id: string
    email: string
  }
  expires_at: string
}

export interface LoginCredentials {
  email: string
  password: string
}