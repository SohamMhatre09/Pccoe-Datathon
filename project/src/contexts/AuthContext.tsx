import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

interface User {
  username: string;
  isAdmin: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await axios.get(`${API_URL}/verify-token`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (response.data.authenticated) {
          setUser(response.data.user);
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem('token');
          setToken(null);
        }
      } catch (error) {
        console.error('Token verification failed:', error);
        localStorage.removeItem('token');
        setToken(null);
      } finally {
        setIsLoading(false);
      }
    };

    verifyToken();
  }, [token]);

  const login = async (username: string, password: string) => {
    try {
      const response = await axios.post(`${API_URL}/login`, { username, password });
      const { token: newToken, user: userData } = response.data;
      
      localStorage.setItem('token', newToken);
      setToken(newToken);
      setUser(userData);
      setIsAuthenticated(true);
      
      // Set authorization header for future requests
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
      
      return response.data;
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
    delete axios.defaults.headers.common['Authorization'];
  };

  const changePassword = async (oldPassword: string, newPassword: string) => {
    try {
      await axios.post(
        `${API_URL}/change-password`,
        { oldPassword, newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (error) {
      throw error;
    }
  };

  // Set default authorization header when token exists
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  }, [token]);

  const value = {
    user,
    token,
    isAuthenticated,
    isLoading,
    login,
    logout,
    changePassword
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};