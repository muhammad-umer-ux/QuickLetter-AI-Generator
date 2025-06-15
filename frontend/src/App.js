/* global __app_id, __firebase_config, __initial_auth_token, crypto */
import React, { useState, useEffect } from 'react';
import './App.css';
import { jsPDF } from 'jspdf';

// Lucide React Icons ko import karein
import { Feather, FileText, Trash2, Download, Copy, CircleDashed } from 'lucide-react';

// Firebase imports
import { initializeApp } from 'firebase/app';
// signInWithCustomToken ko bhi import karein agar wo initial auth flow mein shamil hai
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
// Firestore ke saare zaruri functions import karein
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, doc, deleteDoc } from 'firebase/firestore'; 

function App() {
  const [category, setCategory] = useState('');
  const [language, setLanguage] = useState('');
  const [description, setDescription] = useState('');
  // letterContent ko ab generic generatedContent bana diya gaya hai
  const [generatedContent, setGeneratedContent] = useState(''); // Changed from letterContent
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copySuccess, setCopySuccess] = useState('');
  const [sampleDescLoading, setSampleDescLoading] = useState(false);
  const [sampleDescError, setSampleDescError] = useState('');
  
  // --- Naya State: Document Type (Letter ya Email) ---
  const [documentType, setDocumentType] = useState('letter'); // Default 'letter' set kiya gaya hai

  // Firebase states
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null); 
  const [userId, setUserId] = useState(null); 
  // AppId ko direct initialize karein, jaisa pehle tha
  const [appId, setAppId] = useState("1:922644461860:web:63f8bece3fb4376d86dbb1"); 

  // State for document history (letterHistory se letterHistory hi rakha hai for now)
  // Lekin isme ab letters aur emails dono honge
  const [letterHistory, setLetterHistory] = useState([]); 
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');

  // Define the base URL for your FastAPI backend
  // !!! YAHAN PAR LOCALHOST KE BAJAYE RENDER KA LIVE URL DALA GAYA HAI !!!
  const BASE_API_URL = 'https://quickletter-ai-backend.onrender.com';


  // --- Firebase Initialization and Authentication ---
  useEffect(() => {
    console.log("DEBUG: __app_id (raw):", typeof __app_id !== 'undefined' ? __app_id : "undefined");
    console.log("DEBUG: __firebase_config (raw string):", typeof __firebase_config !== 'undefined' ? __firebase_config : "undefined");
    console.log("DEBUG: __initial_auth_token (raw):", typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : "undefined");

    const firebaseConfig = {
      apiKey: "AIzaSyAfW1CDIBexBPrtJOQyHR_CINq9csSmkLE",
      authDomain: "quickletter-ai-generator.firebaseapp.com",
      projectId: "quickletter-ai-generator",
      storageBucket: "quickletter-ai-generator.firebasestorage.app",
      messagingSenderId: "922644461860",
      appId: "1:922644461860:web:63f8bece3fb4376d86dbb1"
    };

    const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

    if (!firebaseConfig.projectId || !firebaseConfig.apiKey) { 
      console.error("Firebase config is missing essential details (projectId or apiKey). Cannot initialize Firebase.");
      setError("Firebase setup error: Configuration missing or invalid.");
      return; 
    }

    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const authInstance = getAuth(app);

      setDb(firestore);
      setAuth(authInstance); 

      if (initialAuthToken) {
        signInWithCustomToken(authInstance, initialAuthToken)
          .then((userCredential) => {
            setUserId(userCredential.user.uid);
            console.log("Signed in with custom token:", userCredential.user.uid);
          })
          .catch((err) => {
            console.error("Firebase Custom Token sign-in failed:", err);
            signInAnonymously(authInstance)
              .then((userCredential) => {
                setUserId(userCredential.user.uid);
                console.log("Signed in anonymously (fallback):", userCredential.user.uid);
              })
              .catch((anonErr) => {
                console.error("Firebase Anonymous sign-in failed (fallback):", anonErr);
                setUserId(crypto.randomUUID()); 
                setError("Firebase auth error: Could not sign in. Data may not be saved.");
              });
          });
      } else {
        signInAnonymously(authInstance)
          .then((userCredential) => {
            setUserId(userCredential.user.uid);
            console.log("Signed in anonymously (no initial token):", userCredential.user.uid);
          })
          .catch((anonErr) => {
            console.error("Firebase Anonymous sign-in failed (no initial token):", anonErr);
            setUserId(crypto.randomUUID()); 
            setError("Firebase auth error: Could not sign in. Data may not be saved.");
          });
      }
      
      onAuthStateChanged(authInstance, (user) => {
        if (user) {
          if (userId !== user.uid) { 
            setUserId(user.uid);
            console.log("onAuthStateChanged: User ID updated to", user.uid);
          }
        } else {
          if (userId) { 
             setUserId(null); 
             console.log("onAuthStateChanged: User signed out.");
          }
        }
      });

    } catch (firebaseInitError) {
      console.error("Firebase initialization failed:", firebaseInitError);
      setError("Firebase setup error: " + firebaseInitError.message);
    }
  }, []); 

  // useEffect to read document history from Firestore (letters aur emails dono ke liye)
  useEffect(() => {
    if (db && userId && appId) { 
      setHistoryLoading(true);
      setHistoryError('');
      let unsubscribe;

      try {
        // Collection path 'letters' se 'documents' kar diya gaya hai
        const userDocumentsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/documents`);
        const q = query(userDocumentsCollectionRef, orderBy('timestamp', 'desc'));

        unsubscribe = onSnapshot(q, (snapshot) => {
          const documents = []; // letters ki bajaye documents
          snapshot.forEach((doc) => {
            documents.push({
              id: doc.id, 
              ...doc.data() 
            });
          });
          setLetterHistory(documents); // letterHistory state mein hi documents ko save karein
          setHistoryLoading(false);
          console.log("Document history updated:", documents.length, "documents loaded.");
        }, (err) => {
          console.error("Error fetching document history:", err);
          setHistoryError("Failed to load document history: " + err.message);
          setHistoryLoading(false);
        });

      } catch (err) {
        console.error("Error setting up history listener:", err);
        setHistoryError("Failed to set up history listener: " + err.message);
        setHistoryLoading(false);
      }

      return () => {
        if (unsubscribe) {
          unsubscribe();
          console.log("Firestore history listener unsubscribed.");
        }
      };
    } else if (!userId) { 
      setHistoryError("Sign in to view your document history.");
      setHistoryLoading(false);
      setLetterHistory([]); 
    }
  }, [db, userId, appId]); 


  // generateLetter function ka naam ab generateDocument kar diya gaya hai
  const generateDocument = async () => {
    // Input Validation
    if (!category) {
      setError(`Please select a ${documentType === 'letter' ? 'letter' : 'email'} category.`);
      return;
    }
    if (!language) {
      setError('Please select a language.');
      return;
    }
    if (!description.trim()) {
      setError('Please provide a detailed description for your document.');
      return;
    }

    setLoading(true);
    setError('');
    setGeneratedContent(''); // Generated content ko clear karein
    setCopySuccess('');

    try {
      // Endpoint ka path documentType (letter/email) ke hisab se set karein
      const endpoint = documentType === 'letter' ? '/generate_letter/' : '/generate_email/';
      
      // !!! YAHAN PAR BASE_API_URL USE KIYA GAYA HAI !!!
      const response = await fetch(`${BASE_API_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ category, language, description }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      // Backend response structure ke hisab se content extract karein
      const contentKey = documentType === 'letter' ? 'letter_content' : 'email_content';
      const generatedText = data[contentKey];
      setGeneratedContent(generatedText); // generatedContent state ko update karein

      // Document ko Firestore mein save karein
      if (db && userId) { 
        try {
          // Collection path 'letters' se 'documents' kar diya gaya hai
          const userDocumentsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/documents`); 
          await addDoc(userDocumentsCollectionRef, {
            type: documentType, // Naya field 'type' save karein (letter ya email)
            category: category,
            language: language,
            description: description,
            content: generatedText,
            timestamp: new Date(),
          });
          console.log("Document saved to Firestore successfully!");
        } catch (firestoreError) {
          console.error("Error saving document to Firestore:", firestoreError);
          setError(prev => prev ? prev + " And failed to save document." : "Failed to save document to history.");
        }
      } else {
        console.warn("Firestore not initialized or userId not available. Skipping save to history.");
      }

    } catch (err) {
      console.error('Error generating document:', err);
      setError('Error: ' + err.message + '. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Function to delete a document from Firestore (letter/email dono ke liye)
  const deleteDocument = async (documentId) => { // letterId ki bajaye documentId
    if (!db || !userId || !appId) {
      setError("Cannot delete document: Database not ready or user not authenticated.");
      console.error("Delete failed: db, userId or appId not available.");
      return;
    }

    setError(''); 
    console.log(`Attempting to delete document with ID: ${documentId} for user: ${userId}`);

    try {
      // Collection path 'letters' se 'documents' kar diya gaya hai
      const documentDocRef = doc(db, `artifacts/${appId}/users/${userId}/documents`, documentId);
      await deleteDoc(documentDocRef);
      console.log("Document deleted successfully from Firestore!");
    } catch (err) {
      console.error("Error deleting document from Firestore:", err);
      setError("Failed to delete document: " + err.message);
    }
  };


  const copyToClipboard = () => {
    if (generatedContent) { // letterContent ki bajaye generatedContent use karein
      const textarea = document.createElement('textarea');
      textarea.value = generatedContent;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopySuccess(`${documentType === 'letter' ? 'Letter' : 'Email'} copied to clipboard!`); // Message ko generic karein
      setTimeout(() => setCopySuccess(''), 2000);
    }
  };

  const downloadTxtFile = () => {
    if (generatedContent) { // letterContent ki bajaye generatedContent use karein
      const element = document.createElement('a');
      const file = new Blob([generatedContent], { type: 'text/plain' });
      element.href = URL.createObjectURL(file);
      // Filename ko documentType ke hisab se generic karein
      const filename = category ? `${category.replace(/\s/g, '_')}_${documentType === 'letter' ? 'Letter' : 'Email'}.txt` : `Generated_${documentType === 'letter' ? 'Letter' : 'Email'}.txt`;
      element.download = filename;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }
  };

  const downloadPdfFile = () => {
    if (generatedContent) { // letterContent ki bajaye generatedContent use karein
      const doc = new jsPDF();
      doc.setFont("helvetica");
      doc.setFontSize(12);
      const splitText = doc.splitTextToSize(generatedContent, 180);
      doc.text(splitText, 10, 10);
      // Filename ko documentType ke hisab se generic karein
      const filename = category ? `${category.replace(/\s/g, '_')}_${documentType === 'letter' ? 'Letter' : 'Email'}.pdf` : `Generated_${documentType === 'letter' ? 'Letter' : 'Email'}.pdf`;
      doc.save(filename);
    }
  };

  const clearForm = () => {
    setCategory('');
    setLanguage('');
    setDescription('');
    setGeneratedContent(''); // generatedContent ko clear karein
    setError('');
    setCopySuccess('');
    setLoading(false);
    setSampleDescError('');
    setSampleDescLoading(false);
    setDocumentType('letter'); // Clear karne par default 'letter' set karein
  };

  useEffect(() => {
    const fetchSampleDescription = async () => {
      if (category && language) {
        setSampleDescLoading(true);
        setSampleDescError('');
        setDescription('');

        try {
          // !!! YAHAN PAR BASE_API_URL USE KIYA GAYA HAI !!!
          const response = await fetch(`${BASE_API_URL}/generate_sample_description/`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ category, language }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          setDescription(data.sample_description);
        } catch (err) {
          console.error('Error generating sample description:', err);
          setSampleDescError('Could not load sample description: ' + err.message);
        } finally {
          setSampleDescLoading(false);
        }
      } else {
        setDescription('');
        setSampleDescError('');
      }
    };

    fetchSampleDescription();
  }, [category, language]);

  return (
    <div className="App">
      <header className="App-header">
        {/* Header content with logo */}
        <div className="header-content">
          {/* Feather icon for a minimalist quill/writing feel */}
          <Feather size={64} className="app-logo" /> {/* Adjust size as needed */}
          <h1>QuickLetter AI Generator</h1>
          <p>Generate letters and applications easily in English and Urdu.</p>
        </div>
      </header>

      <div className="main-content-card">
        {/* User ID display for debugging/identification */}
        {userId && (
          <div className="user-id-display">
            <p>Your User ID: <strong>{userId}</strong></p>
          </div>
        )}

        <div className="form-section">
          {/* --- Naya: Document Type Selector --- */}
          <div className="form-group document-type-selector">
            <label className="document-type-label">
              Select Document Type:
            </label>
            <div className="radio-buttons-container">
              <label className="radio-label">
                <input
                  type="radio"
                  name="documentType"
                  value="letter"
                  checked={documentType === 'letter'}
                  onChange={(e) => setDocumentType(e.target.value)}
                  className="radio-input"
                />
                Letter (خط)
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  name="documentType"
                  value="email"
                  checked={documentType === 'email'}
                  onChange={(e) => setDocumentType(e.target.value)}
                  className="radio-input"
                />
                Email (ای میل)
              </label>
            </div>
          </div>
          {/* --- End Document Type Selector --- */}

          <div className="form-group">
            <label htmlFor="category">Category:</label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              <option value="">Select a category</option>
              {/* Common categories jo letter aur email dono ke liye kaam a sakti hain */}
              <option value="Job Application">Job Application (ملازمت کی درخواست)</option>
              <option value="Leave Request">Leave Request (چھٹی کی درخواست)</option>
              <option value="Business Inquiry">Business Inquiry (کاروباری انکوائری)</option>
              <option value="Complaint">Complaint (شکایت)</option>
              <option value="Thank You Note">Thank You Note (شکریہ کا نوٹ)</option>
              <option value="Meeting Request">Meeting Request (میٹنگ کی درخواست)</option>
              <option value="Apology">Apology (معافی)</option>
              <option value="Follow-up">Follow-up (فالو اپ)</option>
              <option value="Proposal">Proposal (تجویز)</option>
              <option value="Information Request">Information Request (معلومات کی درخواست)</option>
              <option value="Custom">Custom (اپنی مرضی کے مطابق)</option>
               {/* Agar document type letter hai, to mazeed letter-specific options dikhayen */}
              {documentType === 'letter' && (
                <>
                  <option value="School Leave Application">School Leave Application</option>
                  <option value="Bank Request Letter">Bank Request Letter</option>
                  <option value="College Leave Request">College Leave Request</option>
                  <option value="Scholarship Letter">Scholarship Letter</option>
                  <option value="Internship Request">Internship Request</option>
                  <option value="Bonafide Certificate Application">Bonafide Certificate Application</option>
                  <option value="Leave Application">Employee Leave Application (Sick/Casual/Annual)</option>
                  <option value="Salary Increment Request">Salary Increment Request</option>
                  <option value="Resignation Letter">Resignation Letter</option>
                  <option value="Transfer Request">Transfer Request</option>
                  <option value="Business Partnership Letter">Business Partnership Letter</option>
                  <option value="Invoice Dispute Letter">Invoice Dispute Letter</option>
                  <option value="Vendor Complaint/Request">Vendor Complaint/Request</option>
                  <option value="Utility Bill Issue Letter">Utility Bill Issue Letter</option>
                  <option value="Address Change Application">Address Change Application</option>
                  <option value="Request for Official Document">Request for Official Document</option>
                  <option value="Custom Letter">Custom Letter (AI Prompt)</option>
                </>
              )}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="language">Language:</label>
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              required
            >
              <option value="">Select a language</option>
              <option value="English">English</option>
              <option value="Urdu">Urdu</option>
              <option value="Spanish">Spanish</option>
              <option value="French">French</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="description">Description:</label>
            <textarea
              id="description"
              value={sampleDescLoading ? 'Loading sample description...' : description}
              onChange={(e) => setDescription(e.target.value)}
              // Placeholder text ko documentType ke hisab se change karein
              placeholder={`Provide a detailed description for your ${documentType}. Example: 'I need a ${documentType === 'letter' ? 'job application letter for a junior web developer position' : 'email to request a meeting with John Doe for a project discussion'}.'`}
              rows="6"
              required
              disabled={sampleDescLoading}
            ></textarea>
            {sampleDescError && <p className="sample-desc-error-message">{sampleDescError}</p>}
          </div>

          <div className="form-buttons-container">
            {/* onClick function ko generateDocument par set karein */}
            <button
              onClick={generateDocument}
              disabled={loading || sampleDescLoading}
              className="generate-button"
            >
              {loading ? `Generating ${documentType === 'letter' ? 'Letter' : 'Email'}...` : `Generate ${documentType === 'letter' ? 'Letter' : 'Email'}`}
            </button>
            <button
              onClick={clearForm}
              className="clear-button"
            >
              Clear Form
            </button>
          </div>
        </div>

        {loading && (
          <div className="loading-message">
            {/* Loading icon */}
            <CircleDashed size={24} className="loading-icon" />
            <p>Generating your {documentType}, please wait...</p>
          </div>
        )}

        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}

        {generatedContent && (
          <div className="generated-letter-output"> {/* Class name wahi rakha hai, par ab isme email bhi show hoga */}
            <h3>Your Generated {documentType === 'letter' ? 'Letter' : 'Email'}:</h3>
            <pre>{generatedContent}</pre>
            <div className="action-buttons-container">
              <button
                onClick={copyToClipboard}
                className="copy-button"
              >
                <Copy size={16} /> Copy to Clipboard
              </button>
              <button
                onClick={downloadPdfFile}
                className="download-pdf-button"
              >
                <Download size={16} /> Download as PDF
              </button>
              <button
                onClick={downloadTxtFile}
                className="download-button"
              >
                <FileText size={16} /> Download as TXT
              </button>
            </div>
            {copySuccess && <p className="copy-success-message">{copySuccess}</p>}
          </div>
        )}
      </div>

      {/* Letter History Section */}
      <div className="letter-history-section">
        <h2>Your Document History</h2> {/* Heading ko generic karein */}
        {historyLoading && (
          <p className="history-status">
            <CircleDashed size={20} className="loading-icon-small" /> Loading history...
          </p>
        )}
        {historyError && <p className="history-error-message">{historyError}</p>}
        {!historyLoading && letterHistory.length === 0 && !historyError && (
          <p className="history-status">No documents saved yet. Generate a document to see it here!</p>
        )}
        <div className="letter-history-list">
          {letterHistory.map((docItem) => ( // letter ki bajaye docItem
            <div key={docItem.id} className="history-item-card">
              {/* Type bhi show karein (Letter/Email) */}
              <h3>{docItem.category} ({docItem.type === 'letter' ? 'Letter' : 'Email'}) - {docItem.language}</h3>
              <p className="history-description">Description: {docItem.description}</p>
              <p className="history-timestamp">Saved on: {docItem.timestamp && docItem.timestamp.toDate ? new Date(docItem.timestamp.toDate()).toLocaleString() : new Date(docItem.timestamp).toLocaleString()}</p>
              <pre className="history-content">{docItem.content.substring(0, 200)}...</pre>
              <div className="history-item-actions">
                <button
                  onClick={() => setGeneratedContent(docItem.content)} // setLetterContent ki bajaye setGeneratedContent
                  className="view-full-letter-button"
                >
                  <FileText size={16} /> View Full {docItem.type === 'letter' ? 'Letter' : 'Email'}
                </button>
                <button
                  onClick={() => deleteDocument(docItem.id)} // deleteLetter ki bajaye deleteDocument
                  className="delete-letter-button"
                >
                  <Trash2 size={16} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <footer className="app-footer">
        <p>&copy; {new Date().getFullYear()} QuickLetter AI Generator. All rights reserved.</p>
        <p>Developed by Muhammad Umer Sheraz</p>
      </footer>
    </div>
  );
}

export default App;