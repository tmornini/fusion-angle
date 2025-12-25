import { createContext, useContext, ReactNode } from 'react';

interface AuthContextType {
  user: { email: string } | null;
  session: null;
  loading: boolean;
  signUp: (email: string, password: string, companyName?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Mock user - always logged in
  const mockUser = { email: 'demo@example.com' };

  const signUp = async () => ({ error: null });
  const signIn = async () => ({ error: null });
  const signOut = async () => {};

  return (
    <AuthContext.Provider value={{ 
      user: mockUser, 
      session: null, 
      loading: false, 
      signUp, 
      signIn, 
      signOut 
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
