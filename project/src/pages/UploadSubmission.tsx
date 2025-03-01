import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../config';
import Card from '../components/Card';
import Button from '../components/Button';
import { Upload, FileText, AlertCircle, CheckCircle, X } from 'lucide-react';

interface SubmissionResult {
  f1_score: number;
  accuracy: number;
  timestamp: string;
  uploadsRemaining: number;
}

const UploadSubmission: React.FC = () => {
  const { token } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [requiredRowCount, setRequiredRowCount] = useState<number>(0);
  const [csvPreview, setCsvPreview] = useState<string[]>([]);
  const [uploadsRemaining, setUploadsRemaining] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchRequirements = async () => {
      try {
        // Fetch row count requirement
        const rowCountResponse = await axios.get(`${API_URL}/row-count`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        setRequiredRowCount(rowCountResponse.data.rowCount);
        
        // Fetch user's remaining upload count
        const uploadsResponse = await axios.get(`${API_URL}/uploads-remaining`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        setUploadsRemaining(uploadsResponse.data.uploadsRemaining);
      } catch (error) {
        console.error('Error fetching submission requirements:', error);
        toast.error('Failed to load submission requirements');
      }
    };
    
    fetchRequirements();
  }, [token]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      validateAndSetFile(droppedFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = async (file: File) => {
    // Check if file is CSV
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      toast.error('Only CSV files are allowed');
      return;
    }
    
    // Check file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size exceeds 5MB limit');
      return;
    }
    
    // Read first 5 rows for preview
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result?.toString() || '';
      const rows = text.split('\n').slice(0, 5);
      setCsvPreview(rows);
      
      // Basic validation for required columns
      if (rows.length > 0) {
        const headers = rows[0].toLowerCase();
        if (!headers.includes('isfraud') && !headers.includes('fraudlabel')) {
          toast.error('CSV must contain a column named "isFraud" or "FraudLabel"');
        }
      }
    };
    reader.readAsText(file);
    
    setFile(file);
    setResult(null);
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a file to upload');
      return;
    }
    
    setIsUploading(true);
    setUploadProgress(0);
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await axios.post(`${API_URL}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(progress);
          }
        },
      });
      
      setResult(response.data);
      setUploadsRemaining(response.data.uploadsRemaining);
      toast.success('File uploaded successfully!');
    } catch (error: any) {
      console.error('Upload error:', error);
      const serverError = error.response?.data;
      
      // Handle rate limit (429) error specifically
      if (error.response?.status === 429) {
        const nextReset = serverError.nextReset ? 
          new Date(serverError.nextReset).toLocaleTimeString() : 
          'tomorrow';
        toast.error(`Daily upload limit exceeded. Limit resets at ${nextReset}`);
      } else {
        // Handle other errors
        const errorMessage = serverError?.details 
          ? `${serverError.error}: ${serverError.details}`
          : 'Upload failed. Please check file format and try again.';
        toast.error(errorMessage);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setCsvPreview([]);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Submit Fraud Prediction Model</h1>
      
      {/* Submission Info */}
      <Card className="mb-6 p-4">
        <h2 className="font-semibold text-lg mb-2">Submission Requirements</h2>
        <ul className="list-disc pl-5 mb-4">
          <li>Upload a CSV file with predictions (0 or 1) for each transaction</li>
          <li>Required column: <code>isFraud</code> or <code>FraudLabel</code></li>
          {requiredRowCount > 0 && (
            <li>File must contain exactly {requiredRowCount} rows</li>
          )}
          <li>File size limit: 5MB</li>
        </ul>
        {uploadsRemaining !== null && (
          <div className="text-sm mt-2">
            <p>Uploads remaining today: <span className="font-medium">{uploadsRemaining}</span></p>
          </div>
        )}
      </Card>
      
      {/* File Upload */}
      <Card className="mb-6">
        <div 
          className={`border-2 border-dashed rounded-lg p-8 text-center ${
            isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {!file ? (
            <>
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium mb-2">Drag and drop your CSV file here</h3>
              <p className="text-sm text-gray-500 mb-4">or</p>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".csv"
                className="hidden"
              />
              <Button 
                onClick={() => fileInputRef.current?.click()}
                variant="primary"
              >
                Select File
              </Button>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-center space-x-3">
                <FileText className="h-8 w-8 text-blue-500" />
                <div className="text-left">
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button 
                  onClick={handleRemoveFile}
                  className="ml-4 text-red-500 hover:text-red-700"
                  disabled={isUploading}
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              
              {csvPreview.length > 0 && (
                <div className="bg-gray-50 rounded p-3 text-left text-sm">
                  <p className="font-medium mb-1">File Preview (first 5 rows):</p>
                  <pre className="overflow-x-auto">{csvPreview.join('\n')}</pre>
                </div>
              )}
              
              {!isUploading ? (
                <Button 
                  onClick={handleUpload}
                  variant="primary"
                  className="w-full"
                  disabled={isUploading}
                >
                  Upload File
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className="bg-blue-600 h-2.5 rounded-full" 
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                  <p className="text-sm">{uploadProgress}% Uploaded</p>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>
      
      {/* Results */}
      {result && (
        <Card className="p-4">
          <div className="flex items-center mb-3">
            <CheckCircle className="text-green-500 h-6 w-6 mr-2" />
            <h2 className="text-lg font-semibold">Submission Results</h2>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-sm text-gray-500">F1 Score</p>
              <p className="text-xl font-bold">{(result.f1_score * 100).toFixed(2)}%</p>
            </div>
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-sm text-gray-500">Accuracy</p>
              <p className="text-xl font-bold">{(result.accuracy * 100).toFixed(2)}%</p>
            </div>
          </div>
          
          <p className="mt-4 text-sm text-gray-500">
            Submitted on {new Date(result.timestamp).toLocaleString()}
          </p>
          
          <p className="mt-2 text-sm">
            Uploads remaining today: <span className="font-medium">{result.uploadsRemaining}</span>
          </p>
        </Card>
      )}
    </div>
  );
};

export default UploadSubmission;