import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import Card from '../components/Card';
import Input from '../components/Input';
import Button from '../components/Button';
import { KeyRound } from 'lucide-react';

const ChangePassword: React.FC = () => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { changePassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate inputs
    if (!oldPassword || !newPassword || !confirmPassword) {
      toast.error('All fields are required');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    
    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters long');
      return;
    }
    
    setIsLoading(true);
    
    try {
      await changePassword(oldPassword, newPassword);
      toast.success('Password changed successfully');
      
      // Reset form
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error('Password change error:', error);
      toast.error(error.response?.data?.error || 'Failed to change password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex justify-center">
      <Card className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <KeyRound className="h-12 w-12 text-indigo-600 mb-2" />
          <h2 className="text-2xl font-bold text-gray-900">Change Password</h2>
          <p className="text-gray-600 mt-1">Update your account password</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            id="oldPassword"
            label="Current Password"
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            placeholder="Enter your current password"
            fullWidth
            required
          />
          
          <Input
            id="newPassword"
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter your new password"
            fullWidth
            required
          />
          
          <Input
            id="confirmPassword"
            label="Confirm New Password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm your new password"
            fullWidth
            required
          />
          
          <Button
            type="submit"
            variant="primary"
            isLoading={isLoading}
            fullWidth
          >
            Update Password
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default ChangePassword;