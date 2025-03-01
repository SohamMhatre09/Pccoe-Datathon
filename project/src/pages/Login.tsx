import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import Card from '../components/Card';
import Input from '../components/Input';
import Button from '../components/Button';
import { Award } from 'lucide-react';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username || !password) {
      toast.error('Please enter both username and password');
      return;
    }
    
    setIsLoading(true);
    
    try {
      await login(username, password);
      toast.success('Login successful!');
      navigate('/dashboard');
    } catch (error: any) {
      console.error('Login error:', error);
      toast.error(error.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex justify-center items-center min-h-[calc(100vh-64px)]">
      <Card className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <Award className="h-12 w-12 text-indigo-600 mb-2" />
          <h2 className="text-2xl font-bold text-gray-900">Sign in to your account</h2>
          <p className="text-gray-600 mt-1">Enter your credentials to access the platform</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            id="username"
            label="Username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            fullWidth
            required
          />
          
          <Input
            id="password"
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            fullWidth
            required
          />
          
          <Button
            type="submit"
            variant="primary"
            isLoading={isLoading}
            fullWidth
          >
            Sign in
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default Login;