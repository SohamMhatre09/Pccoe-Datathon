import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Leaderboard from './pages/Leaderboard';
import UploadSubmission from './pages/UploadSubmission';
import ChangePassword from './pages/ChangePassword';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <div className="container mx-auto px-4 py-8">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route 
                path="/dashboard" 
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/upload" 
                element={
                  <ProtectedRoute>
                    <UploadSubmission />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/change-password" 
                element={
                  <ProtectedRoute>
                    <ChangePassword />
                  </ProtectedRoute>
                } 
              />
              <Route path="/" element={<Navigate to="/leaderboard" replace />} />
            </Routes>
          </div>
          <Toaster position="top-right" />
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;