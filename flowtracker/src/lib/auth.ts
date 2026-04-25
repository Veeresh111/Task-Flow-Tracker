import { supabase } from './supabase';

export const authService = {
  // 1. Register a new user
  signUp: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    
    if (error) {
      console.error("Signup Error:", error.message);
      throw error;
    }
    return data;
  },

  // 2. Log in an existing user
  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) {
      console.error("Login Error:", error.message);
      throw error;
    }
    return data;
  },

  // 3. Log out the current user
  signOut: async () => {
    const { error } = await supabase.auth.signOut();
    
    if (error) {
      console.error("Logout Error:", error.message);
      throw error;
    }
  },

  // 4. Get the currently logged-in user's data
  getCurrentUser: async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error) {
      console.error("Get User Error:", error.message);
      return null;
    }
    return user;
  }
};