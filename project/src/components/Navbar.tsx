import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Menu, X, ChevronDown, Award, BarChart2, Upload, User, LogOut } from 'lucide-react';

const Navbar: React.FC = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
  const toggleProfile = () => setIsProfileOpen(!isProfileOpen);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="bg-indigo-600 shadow-md">
      <div className="container mx-auto px-4">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex-shrink-0 flex items-center">
              <Award className="h-8 w-8 text-white" />
              <span className="ml-2 text-xl font-bold text-white">DataComp</span>
            </Link>
            <div className="hidden md:ml-6 md:flex md:space-x-4">
              <Link
                to="/leaderboard"
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  isActive('/leaderboard')
                    ? 'bg-indigo-700 text-white'
                    : 'text-indigo-100 hover:bg-indigo-500'
                }`}
              >
                Leaderboard
              </Link>
              {isAuthenticated && (
                <>
                  <Link
                    to="/dashboard"
                    className={`px-3 py-2 rounded-md text-sm font-medium ${
                      isActive('/dashboard')
                        ? 'bg-indigo-700 text-white'
                        : 'text-indigo-100 hover:bg-indigo-500'
                    }`}
                  >
                    Dashboard
                  </Link>
                  <Link
                    to="/upload"
                    className={`px-3 py-2 rounded-md text-sm font-medium ${
                      isActive('/upload')
                        ? 'bg-indigo-700 text-white'
                        : 'text-indigo-100 hover:bg-indigo-500'
                    }`}
                  >
                    Upload
                  </Link>
                </>
              )}
            </div>
          </div>
          <div className="hidden md:flex md:items-center">
            {isAuthenticated ? (
              <div className="ml-3 relative">
                <div>
                  <button
                    onClick={toggleProfile}
                    className="flex items-center max-w-xs text-sm rounded-full text-white focus:outline-none"
                  >
                    <span className="mr-2">{user?.username}</span>
                    <User className="h-6 w-6 bg-indigo-500 p-1 rounded-full" />
                    <ChevronDown className="h-4 w-4 ml-1" />
                  </button>
                </div>
                {isProfileOpen && (
                  <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-white ring-1 ring-black ring-opacity-5 z-10">
                    <Link
                      to="/change-password"
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                      onClick={() => setIsProfileOpen(false)}
                    >
                      Change Password
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/login"
                className="ml-4 px-4 py-2 rounded-md text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-400"
              >
                Sign in
              </Link>
            )}
          </div>
          <div className="flex items-center md:hidden">
            <button
              onClick={toggleMenu}
              className="inline-flex items-center justify-center p-2 rounded-md text-indigo-100 hover:text-white hover:bg-indigo-500 focus:outline-none"
            >
              {isMenuOpen ? (
                <X className="block h-6 w-6" />
              ) : (
                <Menu className="block h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
            <Link
              to="/leaderboard"
              className={`block px-3 py-2 rounded-md text-base font-medium ${
                isActive('/leaderboard')
                  ? 'bg-indigo-700 text-white'
                  : 'text-indigo-100 hover:bg-indigo-500'
              }`}
              onClick={toggleMenu}
            >
              <div className="flex items-center">
                <Award className="mr-2 h-5 w-5" />
                Leaderboard
              </div>
            </Link>
            {isAuthenticated && (
              <>
                <Link
                  to="/dashboard"
                  className={`block px-3 py-2 rounded-md text-base font-medium ${
                    isActive('/dashboard')
                      ? 'bg-indigo-700 text-white'
                      : 'text-indigo-100 hover:bg-indigo-500'
                  }`}
                  onClick={toggleMenu}
                >
                  <div className="flex items-center">
                    <BarChart2 className="mr-2 h-5 w-5" />
                    Dashboard
                  </div>
                </Link>
                <Link
                  to="/upload"
                  className={`block px-3 py-2 rounded-md text-base font-medium ${
                    isActive('/upload')
                      ? 'bg-indigo-700 text-white'
                      : 'text-indigo-100 hover:bg-indigo-500'
                  }`}
                  onClick={toggleMenu}
                >
                  <div className="flex items-center">
                    <Upload className="mr-2 h-5 w-5" />
                    Upload
                  </div>
                </Link>
              </>
            )}
          </div>
          <div className="pt-4 pb-3 border-t border-indigo-500">
            {isAuthenticated ? (
              <div className="px-2 space-y-1">
                <div className="block px-3 py-2 rounded-md text-base font-medium text-indigo-100">
                  {user?.username}
                </div>
                <Link
                  to="/change-password"
                  className="block px-3 py-2 rounded-md text-base font-medium text-indigo-100 hover:bg-indigo-500"
                  onClick={toggleMenu}
                >
                  <div className="flex items-center">
                    <User className="mr-2 h-5 w-5" />
                    Change Password
                  </div>
                </Link>
                <button
                  onClick={() => {
                    handleLogout();
                    toggleMenu();
                  }}
                  className="w-full text-left block px-3 py-2 rounded-md text-base font-medium text-indigo-100 hover:bg-indigo-500"
                >
                  <div className="flex items-center">
                    <LogOut className="mr-2 h-5 w-5" />
                    Sign out
                  </div>
                </button>
              </div>
            ) : (
              <div className="px-2">
                <Link
                  to="/login"
                  className="block px-3 py-2 rounded-md text-base font-medium text-white bg-indigo-500 hover:bg-indigo-400"
                  onClick={toggleMenu}
                >
                  Sign in
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;