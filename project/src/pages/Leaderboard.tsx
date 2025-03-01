import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { API_URL } from '../config';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import { Award, RefreshCw, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface LeaderboardEntry {
  user_id: string;
  f1_score: number;
  accuracy: number;
  last_submission: string;
}

const Leaderboard: React.FC = () => {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { user } = useAuth();

  const fetchLeaderboard = useCallback(async () => {
    try {
      setIsRefreshing(true);
      const response = await axios.get(`${API_URL}/leaderboard?limit=20`);
      setLeaderboard(response.data.leaderboard);
      setLastUpdated(new Date());
    } catch (error: any) {
      console.error('Error fetching leaderboard:', error);
      toast.error(error.response?.data?.error || 'Failed to load leaderboard');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchLeaderboard();
    
    // Auto-refresh every 2 minutes
    const intervalId = setInterval(() => {
      fetchLeaderboard();
    }, 2 * 60 * 1000);
    
    return () => clearInterval(intervalId);
  }, [fetchLeaderboard]);

  const handleRefresh = () => {
    fetchLeaderboard();
  };

  const isCurrentUser = (userId: string) => {
    return user && user.username === userId;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-64px)]">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Competition Leaderboard</h1>
          <p className="text-gray-600">Top performers ranked by F1 score</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center px-3 py-2 bg-indigo-100 text-indigo-700 rounded-md hover:bg-indigo-200 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4 text-sm text-gray-500">
          <div className="flex items-center">
            <Clock className="h-4 w-4 mr-1" />
            Last updated: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : 'Never'}
          </div>
          <div>Auto-refreshes every 2 minutes</div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rank
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  F1 Score
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Accuracy
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Submission
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {leaderboard.map((entry, index) => (
                <tr 
                  key={entry.user_id} 
                  className={isCurrentUser(entry.user_id) ? 'bg-indigo-50' : ''}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {index < 3 ? (
                        <Award className={`h-5 w-5 mr-1 ${
                          index === 0 ? 'text-yellow-500' : 
                          index === 1 ? 'text-gray-400' : 
                          'text-amber-700'
                        }`} />
                      ) : null}
                      <span className={`text-sm font-medium ${
                        index < 3 ? 'text-gray-900' : 'text-gray-500'
                      }`}>
                        {index + 1}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="text-sm font-medium text-gray-900">
                        {entry.user_id}
                        {isCurrentUser(entry.user_id) && (
                          <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                            You
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{entry.f1_score.toFixed(4)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{entry.accuracy.toFixed(4)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(entry.last_submission).toLocaleString()}
                  </td>
                </tr>
              ))}
              
              {leaderboard.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                    No entries yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default Leaderboard;