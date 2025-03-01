import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../config';
import Card from '../components/Card';
import Button from '../components/Button';
import { Upload, FileText, AlertCircle, CheckCircle, X } from 'lucide-react';

const UploadSubmission: React.FC = () => {
  const { token } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<{
    f1_score: number;
    accuracy: number;
    timestamp: string;
    uploadsRemaining: number;
  } | null>(null);
  const [requiredRowCount, setRequiredRowCount] = useState<number>(0);
  const [csvPreview, setCsvPreview] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchRowCount = async () => {
      try {
        const response = await axios.get(`${API_URL}/row-count`);
        setRequiredRowCount(response.data.rowCount);
      } catch (error) {
        console.error('Error fetching row count:', error);
        toast.error('Failed to load submission requirements');
      }
    };
    
    fetchRowCount();
  }, []);

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
      setCsvPreview(text.split('\n').slice(0, 5));
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
      toast.success('File uploaded successfully!');
    } catch (error: any) {
      console.error('Upload error:', error);
      const serverError = error.response?.data;
      const errorMessage = serverError?.details 
        ? `${serverError.error}: ${serverError.details}`
        : 'Upload failed. Please check file format and try again.';
      toast.error(errorMessage);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Upload Submission</h1>
      <p className="text-gray-600">Upload your CSV file with predictions to evaluate your model</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div
            className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center h-64 transition-colors ${
              isDragging
                ? 'border-indigo-500 bg-indigo-50'
                : file
                ? 'border-green-500 bg-green-50'
                : 'border-gray-300 hover:border-indigo-400'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {file ? (
              <div className="flex flex-col items-center">
                <FileText className="h-12 w-12 text-green-500 mb-2" />
                <p className="text-sm font-medium text-gray-900">{file.name}</p>
                <p className="text-xs text-gray-500 mb-4">
                  {(file.size / 1024).toFixed(2)} KB
                </p>
                <div className="flex space-x-2">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleRemoveFile}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleUpload}
                    isLoading={isUploading}
                    disabled={isUploading}
                  >
                    <Upload className="h-4 w-4 mr-1" />
                    {isUploading ? 'Uploading...' : 'Upload'}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Upload className="h-12 w-12 text-gray-400 mb-2" />
                <p className="text-sm font-medium text-gray-900">
                  Drag and drop your CSV file here
                </p>
                <p className="text-xs text-gray-500 mb-4">
                  or click to browse files (max 5MB)
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Browse Files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </>
            )}
          </div>

          {isUploading && (
            <div className="mt-4">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-indigo-600 h-2 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          )}

          {file && (
            <div className="mt-4">
              <p className="text-sm font-medium text-gray-700 mb-2">CSV Preview (first 5 rows):</p>
              <div className="bg-gray-50 p-3 rounded-md font-mono text-sm">
                {csvPreview.map((line, index) => (
                  <div key={index} className="text-gray-600">{line}</div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-md p-3">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-yellow-500 mr-2" />
              <div className="text-sm text-yellow-700">
                <p className="font-medium">Required CSV Format:</p>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>Single column with header <code>FraudLabel</code> (case-sensitive)</li>
                  <li>Binary values (0 or 1) only</li>
                  <li>No empty rows or additional columns</li>
                  <li>Exactly {requiredRowCount} rows matching test set</li>
                  <li>CSV encoding: UTF-8</li>
                </ul>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Submission Results">
          {result ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center mb-4">
                <CheckCircle className="h-12 w-12 text-green-500" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-indigo-50 p-4 rounded-lg">
                  <p className="text-sm text-indigo-700 font-medium">F1 Score</p>
                  <p className="text-2xl font-bold text-indigo-900">
                    {result.f1_score.toFixed(4)}
                  </p>
                </div>
                
                <div className="bg-green-50 p-4 rounded-lg">
                  <p className="text-sm text-green-700 font-medium">Accuracy</p>
                  <p className="text-2xl font-bold text-green-900">
                    {result.accuracy.toFixed(4)}
                  </p>
                </div>
              </div>
              
              <div className="border-t border-gray-200 pt-4 mt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Submission Time:</span>
                  <span className="text-gray-900 font-medium">
                    {new Date(result.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-sm mt-2">
                  <span className="text-gray-500">Uploads Remaining Today:</span>
                  <span className="text-gray-900 font-medium">
                    {result.uploadsRemaining}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-gray-500">
              <FileText className="h-12 w-12 mb-2" />
              <p>No submission results yet</p>
              <p className="text-sm mt-1">Upload a file to see results</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default UploadSubmission;