export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
}

export interface AuthResponse {
  success: boolean;
  data: {
    authenticated: boolean;
    user: User;
  };
}
