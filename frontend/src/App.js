/* global __app_id, __firebase_config, __initial_auth_token, crypto */
import React, { useState, useEffect } from 'react';
import './App.css'; // اگر آپ Tailwind CSS استعمال کر رہے ہیں تو اس کی جگہ Tailwind directives استعمال کریں
import { jsPDF } from 'jspdf';

// Lucide React Icons کو امپورٹ کریں
import { Feather, FileText, Trash2, Download, Copy, CircleDashed, MessageSquareText, Loader2, Send } from 'lucide-react';

// Firebase imports
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, doc, deleteDoc, serverTimestamp } from 'firebase/firestore'; 

function App() {
  const [category, setCategory] = useState('');
  const [language, setLanguage] = useState('');
  const [description, setDescription] = useState('');
  const [generatedContent, setGeneratedContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copySuccess, setCopySuccess] = useState('');
  const [sampleDescLoading, setSampleDescLoading] = useState(false);
  const [sampleDescError, setSampleDescError] = useState('');
  
  const [documentType, setDocumentType] = useState('letter'); 

  // Firebase states
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null); 
  const [userId, setUserId] = useState(null); 
  const [appId, setAppId] = useState(null); // __app_id سے ویلیو آئے گی، ہارڈ کوڈ نہیں کریں گے 

  const [letterHistory, setLetterHistory] = useState([]); 
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');

  // Define the base URL for your FastAPI backend
  // !!! اب یہ Render Environment Variable (REACT_APP_API_BASE_URL) کو استعمال کرے گا !!!
  const BASE_API_URL = process.env.REACT_APP_API_BASE_URL;

  // --- Firebase Initialization and Authentication ---
  useEffect(() => {
    // __app_id اور __firebase_config کو گلوبل ویری ایبلز سے حاصل کریں
    const currentAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    setAppId(currentAppId);

    const firebaseConfigString = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
    let firebaseConfig = null;
    if (firebaseConfigString) {
      try {
        firebaseConfig = JSON.parse(firebaseConfigString);
      } catch (e) {
        console.error("Error parsing __firebase_config:", e);
        setError("فائر بیس کنفیگ لوڈ کرنے میں ناکامی۔ براہ کرم بعد میں دوبارہ کوشش کریں۔");
        setLoading(false);
        return;
      }
    }

    if (!firebaseConfig || !firebaseConfig.projectId || !firebaseConfig.apiKey) { 
      console.error("Firebase config is missing essential details (projectId or apiKey). Cannot initialize Firebase.");
      setError("فائر بیس سیٹ اپ ایرر: کنفیگریشن نامکمل یا غلط ہے۔");
      setLoading(false);
      return; 
    }

    try {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const authInstance = getAuth(app);

      setDb(firestore);
      setAuth(authInstance); 
      
      const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

      // Auth state changes کو سنیں
      const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
        if (user) {
          // اگر یوزر سائن ان ہے
          setUserId(user.uid);
          console.log("یوزر سائن ان ہو گیا:", user.uid);
        } else {
          // اگر یوزر سائن ان نہیں ہے، تو گیسٹ کے طور پر سائن ان کریں یا کسٹم ٹوکن کے ساتھ
          try {
            if (initialAuthToken) { // اگر ٹوکن فراہم کیا گیا ہے
              await signInWithCustomToken(authInstance, initialAuthToken);
              console.log("کسٹم ٹوکن کے ساتھ سائن ان ہو گیا ہوں۔");
            } else { // اگر ٹوکن نہیں یا ناکام ہو تو گمنام طور پر سائن ان کریں
              await signInAnonymously(authInstance);
              console.log("گمنام طور پر سائن ان ہو گیا ہوں۔");
            }
          } catch (authError) {
            console.error("فائر بیس Auth ایرر سائن ان کے دوران:", authError);
            setError(`تصدیق میں ناکامی: ${authError.message}۔ ڈیٹا شاید محفوظ نہ ہو۔`);
            // اگر گمنام سائن ان بھی ناکام ہو تو عارضی سیشن کے لیے ایک بے ترتیب UUID استعمال کریں
            setUserId(crypto.randomUUID()); 
          }
        }
        setLoading(false); // Auth لوڈنگ مکمل
      });

      return () => unsubscribe(); // کلین اپ فنکشن
    } catch (firebaseInitError) {
      console.error("فائر بیس شروع کرنے میں ناکامی:", firebaseInitError);
      setError("فائر بیس سیٹ اپ ایرر: " + firebaseInitError.message);
      setLoading(false);
    }
  }, []); 

  // Firestore سے دستاویز کی تاریخ پڑھنے کے لیے useEffect Hook
  useEffect(() => {
    // `db`، `userId`، اور `appId` تینوں دستیاب ہونے پر ہی listener سیٹ کریں
    if (db && userId && appId) { 
      setHistoryLoading(true);
      setHistoryError('');
      let unsubscribe;

      try {
        // Firestore سیکیورٹی رولز کے مطابق پرائیویٹ کلیکشن پاتھ
        const userDocumentsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/documents`);
        const q = query(userDocumentsCollectionRef, orderBy('timestamp', 'desc'));

        unsubscribe = onSnapshot(q, (snapshot) => {
          const documents = [];
          snapshot.forEach((doc) => {
            documents.push({
              id: doc.id, 
              ...doc.data() 
            });
          });
          setLetterHistory(documents);
          setHistoryLoading(false);
          console.log("دستاویز کی تاریخ اپ ڈیٹ ہو گئی:", documents.length, "دستاویزات لوڈ ہوئیں۔");
        }, (err) => {
          console.error("دستاویز کی تاریخ حاصل کرنے میں ایرر:", err);
          setHistoryError("دستاویز کی تاریخ لوڈ کرنے میں ناکامی: " + err.message);
          setHistoryLoading(false);
        });

      } catch (err) {
        console.error("ہسٹری listener سیٹ اپ کرنے میں ایرر:", err);
        setHistoryError("ہسٹری listener سیٹ اپ کرنے میں ناکامی: " + err.message);
        setHistoryLoading(false);
      }

      return () => {
        if (unsubscribe) {
          unsubscribe();
          console.log("فائر سٹور ہسٹری listener ان سبسکرائب ہو گیا۔");
        }
      };
    } else if (!userId && !loading) { // اگر یوزر ID نہیں ہے اور ایپ ابھی لوڈ نہیں ہو رہی
      setHistoryError("سائن ان کریں تاکہ آپ اپنے دستاویزات کی ہسٹری دیکھ سکیں۔");
      setHistoryLoading(false);
      setLetterHistory([]); 
    }
  }, [db, userId, appId, loading]); // `loading` کو بھی dependency میں شامل کیا تاکہ Auth state تیار ہونے پر ہسٹری لوڈ ہو

  // API سے دستاویز جنریٹ کرنے کا فنکشن
  const generateDocument = async () => {
    // Input Validation
    if (!category) {
      setError(`براہ کرم ایک ${documentType === 'letter' ? 'خط' : 'ای میل'} کی کیٹیگری منتخب کریں۔`);
      return;
    }
    if (!language) {
      setError('براہ کرم ایک زبان منتخب کریں۔');
      return;
    }
    if (!description.trim()) {
      setError('براہ کرم اپنے دستاویز کے لیے ایک تفصیلی تفصیل فراہم کریں۔');
      return;
    }

    setLoading(true);
    setError('');
    setGeneratedContent('');
    setCopySuccess('');

    try {
      // Backend میں صرف ایک API endpoint ہے: /generate-text
      // اس لیے ہم category, language, اور description کو ایک ہی prompt سٹرنگ میں کम्बाइन کریں گے
      const promptText = `مجھے ایک ${language} میں ${documentType === 'letter' ? 'خط' : 'ای میل'} درکار ہے۔ اس کی کیٹیگری "${category}" ہے۔ تفصیل یہ ہے: "${description}"۔`;
      
      const response = await fetch(`${BASE_API_URL}/generate-text`, { // صحیح API endpoint
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: promptText }), // promptText کو JSON میں بھیجیں
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `HTTP ایرر! اسٹیٹس: ${response.status}`);
      }

      const data = await response.json();
      const generatedText = data.candidates && data.candidates.length > 0 &&
                            data.candidates[0].content && data.candidates[0].content.parts &&
                            data.candidates[0].content.parts.length > 0
                            ? data.candidates[0].content.parts[0].text
                            : "کوئی جواب جنریٹ نہیں ہوا۔";
                            
      setGeneratedContent(generatedText);

      // Document کو Firestore میں سیو کریں
      if (db && userId && appId) { 
        try {
          const userDocumentsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/documents`); 
          await addDoc(userDocumentsCollectionRef, {
            type: documentType,
            category: category,
            language: language,
            description: description,
            content: generatedText,
            timestamp: serverTimestamp(), // serverTimestamp() کا استعمال کریں
          });
          console.log("دستاویز فائر سٹور میں کامیابی سے محفوظ ہو گیا!");
        } catch (firestoreError) {
          console.error("دستاویز فائر سٹور میں محفوظ کرنے میں ایرر:", firestoreError);
          setError(prev => prev ? prev + " اور دستاویز محفوظ کرنے میں ناکامی۔" : "دستاویز محفوظ کرنے میں ناکامی۔");
        }
      } else {
        console.warn("فائر سٹور تیار نہیں یا یوزر ID دستیاب نہیں ہے۔ ہسٹری میں محفوظ کرنا چھوڑ دیا گیا۔");
      }

    } catch (err) {
      console.error('دستاویز جنریٹ کرنے میں ایرر:', err);
      setError('ایر ر: ' + err.message + '۔ براہ کرم دوبارہ کوشش کریں۔');
    } finally {
      setLoading(false);
    }
  };

  // مثال تفصیل جنریٹ کرنے کا فنکشن (اسے /generate-text پر میپ کریں گے)
  useEffect(() => {
    const fetchSampleDescription = async () => {
      if (category && language) {
        setSampleDescLoading(true);
        setSampleDescError('');
        setDescription('');

        try {
          // مثال تفصیل کے لیے بھی /generate-text کا استعمال کریں
          const promptText = `مجھے "${category}" کیٹیگری کے لیے ${language} میں ایک مختصر، 2-3 سطروں کی مثال تفصیل درکار ہے تاکہ یوزر کو معلوم ہو کہ وہ کیا تفصیل درج کریں۔`;
          
          const response = await fetch(`${BASE_API_URL}/generate-text`, { // صحیح API endpoint
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt: promptText }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `HTTP ایرر! اسٹیٹس: ${response.status}`);
          }

          const data = await response.json();
          const sampleDescription = data.candidates && data.candidates.length > 0 &&
                                    data.candidates[0].content && data.candidates[0].content.parts &&
                                    data.candidates[0].content.parts.length > 0
                                    ? data.candidates[0].content.parts[0].text
                                    : "مثال تفصیل دستیاب نہیں۔";

          setDescription(sampleDescription);
        } catch (err) {
          console.error('مثال تفصیل جنریٹ کرنے میں ایرر:', err);
          setSampleDescError('مثال تفصیل لوڈ نہیں ہو سکی: ' + err.message);
        } finally {
          setSampleDescLoading(false);
        }
      } else {
        setDescription('');
        setSampleDescError('');
      }
    };

    fetchSampleDescription();
  }, [category, language, BASE_API_URL]); // BASE_API_URL کو بھی dependency میں شامل کریں

  // Firestore سے دستاویز کو حذف کرنے کا فنکشن
  const deleteDocument = async (documentId) => {
    if (!db || !userId || !appId) {
      setError("دستاویز ہٹایا نہیں جا سکتا: ڈیٹا بیس تیار نہیں یا صارف کی تصدیق نہیں ہوئی۔");
      console.error("حذف کرنے میں ناکامی: db، userId یا appId دستیاب نہیں۔");
      return;
    }

    setError(''); 
    console.log(`دستاویز ID کے ساتھ حذف کرنے کی کوشش: ${documentId} یوزر کے لیے: ${userId}`);

    try {
      const documentDocRef = doc(db, `artifacts/${appId}/users/${userId}/documents`, documentId);
      await deleteDoc(documentDocRef);
      console.log("دستاویز فائر سٹور سے کامیابی سے حذف ہو گیا!");
    } catch (err) {
      console.error("دستاویز فائر سٹور سے حذف کرنے میں ایرر:", err);
      setError("دستاویز حذف کرنے میں ناکامی: " + err.message);
    }
  };

  const copyToClipboard = () => {
    if (generatedContent) {
      const textarea = document.createElement('textarea');
      textarea.value = generatedContent;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopySuccess(`${documentType === 'letter' ? 'خط' : 'ای میل'} کلپ بورڈ پر کاپی ہو گیا!`);
      setTimeout(() => setCopySuccess(''), 2000);
    }
  };

  const downloadTxtFile = () => {
    if (generatedContent) {
      const element = document.createElement('a');
      const file = new Blob([generatedContent], { type: 'text/plain' });
      element.href = URL.createObjectURL(file);
      const filename = category ? `${category.replace(/\s/g, '_')}_${documentType === 'letter' ? 'خط' : 'ای میل'}.txt` : `Generated_${documentType === 'letter' ? 'خط' : 'ای میل'}.txt`;
      element.download = filename;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    }
  };

  const downloadPdfFile = () => {
    if (generatedContent) {
      const doc = new jsPDF();
      doc.setFont("helvetica");
      doc.setFontSize(12);
      const splitText = doc.splitTextToSize(generatedContent, 180);
      doc.text(splitText, 10, 10);
      const filename = category ? `${category.replace(/\s/g, '_')}_${documentType === 'letter' ? 'خط' : 'ای میل'}.pdf` : `Generated_${documentType === 'letter' ? 'خط' : 'ای میل'}.pdf`;
      doc.save(filename);
    }
  };

  const clearForm = () => {
    setCategory('');
    setLanguage('');
    setDescription('');
    setGeneratedContent('');
    setError('');
    setCopySuccess('');
    setLoading(false);
    setSampleDescError('');
    setSampleDescLoading(false);
    setDocumentType('letter');
  };

  // اگر ایپ لوڈ ہو رہی ہے تو لوڈنگ انڈیکیٹر دکھائیں
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <Loader2 className="animate-spin h-8 w-8 mr-3" />
        <p>ایپ لوڈ ہو رہی ہے...</p>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-content">
          <Feather size={64} className="app-logo" />
          <h1>کوئیک لیٹر AI جنریٹر</h1>
          <p>آسانی سے انگریزی اور اردو میں خطوط اور درخواستیں تیار کریں۔</p>
        </div>
      </header>

      <div className="main-content-card">
        {userId && (
          <div className="user-id-display">
            <p>آپ کا یوزر ID: <strong>{userId}</strong></p>
          </div>
        )}

        {error && (
          <div className="error-message">
            <p>{error}</p>
          </div>
        )}

        <div className="form-section">
          <div className="form-group document-type-selector">
            <label className="document-type-label">
              دستاویز کی قسم منتخب کریں:
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
                خط
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
                ای میل
              </label>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="category">کیٹیگری:</label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            >
              <option value="">ایک کیٹیگری منتخب کریں</option>
              <option value="Job Application">ملازمت کی درخواست</option>
              <option value="Leave Request">چھٹی کی درخواست</option>
              <option value="Business Inquiry">کاروباری انکوائری</option>
              <option value="Complaint">شکایت</option>
              <option value="Thank You Note">شکریہ کا نوٹ</option>
              <option value="Meeting Request">میٹنگ کی درخواست</option>
              <option value="Apology">معافی</option>
              <option value="Follow-up">فالو اپ</option>
              <option value="Proposal">تجویز</option>
              <option value="Information Request">معلومات کی درخواست</option>
              <option value="Custom">اپنی مرضی کے مطابق</option>
              {documentType === 'letter' && (
                <>
                  <option value="School Leave Application">اسکول چھٹی کی درخواست</option>
                  <option value="Bank Request Letter">بینک درخواست خط</option>
                  <option value="College Leave Request">کالج چھٹی کی درخواست</option>
                  <option value="Scholarship Letter">اسکالرشپ خط</option>
                  <option value="Internship Request">انٹرنشپ کی درخواست</option>
                  <option value="Bonafide Certificate Application">بونافائیڈ سرٹیفکیٹ کی درخواست</option>
                  <option value="Leave Application">ملازم چھٹی کی درخواست (بیماری/عام/سالانہ)</option>
                  <option value="Salary Increment Request">تنخواہ میں اضافے کی درخواست</option>
                  <option value="Resignation Letter">استعفیٰ نامہ</option>
                  <option value="Transfer Request">تبادلے کی درخواست</option>
                  <option value="Business Partnership Letter">کاروباری شراکت کا خط</option>
                  <option value="Invoice Dispute Letter">انوائس تنازع کا خط</option>
                  <option value="Vendor Complaint/Request">وینڈر شکایت/درخواست</option>
                  <option value="Utility Bill Issue Letter">یوٹیلیٹی بل کے مسئلے کا خط</option>
                  <option value="Address Change Application">پتہ کی تبدیلی کی درخواست</option>
                  <option value="Request for Official Document">سرکاری دستاویز کے لیے درخواست</option>
                  <option value="Custom Letter">اپنی مرضی کا خط (AI پرامپٹ)</option>
                </>
              )}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="language">زبان:</label>
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              required
            >
              <option value="">ایک زبان منتخب کریں</option>
              <option value="English">انگریزی</option>
              <option value="Urdu">اردو</option>
              <option value="Spanish">ہسپانوی</option>
              <option value="French">فرانسیسی</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="description">تفصیل:</label>
            <textarea
              id="description"
              value={sampleDescLoading ? 'مثال تفصیل لوڈ ہو رہی ہے...' : description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={`اپنی ${documentType === 'letter' ? 'خط' : 'ای میل'} کے لیے تفصیلی وضاحت فراہم کریں۔ مثال: 'مجھے ایک ${documentType === 'letter' ? 'جونئر ویب ڈویلپر کی ملازمت کی درخواست کا خط' : 'پراجیکٹ ڈسکشن کے لیے جان ڈو کے ساتھ میٹنگ کی درخواست کا ای میل'} درکار ہے۔'`}
              rows="6"
              required
              disabled={sampleDescLoading}
            ></textarea>
            {sampleDescError && <p className="sample-desc-error-message">{sampleDescError}</p>}
          </div>

          <div className="form-buttons-container">
            <button
              onClick={generateDocument}
              disabled={loading || sampleDescLoading}
              className="generate-button"
            >
              {loading ? `جنریٹ کر رہا ہے ${documentType === 'letter' ? 'خط' : 'ای میل'}...` : `جنریٹ کریں ${documentType === 'letter' ? 'خط' : 'ای میل'}`}
            </button>
            <button
              onClick={clearForm}
              className="clear-button"
            >
              فارم صاف کریں
            </button>
          </div>
        </div>

        {loading && (
          <div className="loading-message">
            <CircleDashed size={24} className="loading-icon" />
            <p>آپ کا {documentType} جنریٹ ہو رہا ہے، براہ کرم انتظار کریں...</p>
          </div>
        )}

        {generatedContent && (
          <div className="generated-letter-output">
            <h3>آپ کا جنریٹ شدہ {documentType === 'letter' ? 'خط' : 'ای میل'}:</h3>
            <pre>{generatedContent}</pre>
            <div className="action-buttons-container">
              <button
                onClick={copyToClipboard}
                className="copy-button"
              >
                <Copy size={16} /> کلپ بورڈ پر کاپی کریں
              </button>
              <button
                onClick={downloadPdfFile}
                className="download-pdf-button"
              >
                <Download size={16} /> پی ڈی ایف کے طور پر ڈاؤن لوڈ کریں
              </button>
              <button
                onClick={downloadTxtFile}
                className="download-button"
              >
                <FileText size={16} /> TXT کے طور پر ڈاؤن لوڈ کریں
              </button>
            </div>
            {copySuccess && <p className="copy-success-message">{copySuccess}</p>}
          </div>
        )}
      </div>

      <div className="letter-history-section">
        <h2>آپ کی دستاویز کی تاریخ</h2>
        {historyLoading && (
          <p className="history-status">
            <CircleDashed size={20} className="loading-icon-small" /> ہسٹری لوڈ ہو رہی ہے...
          </p>
        )}
        {historyError && <p className="history-error-message">{historyError}</p>}
        {!historyLoading && letterHistory.length === 0 && !historyError && (
          <p className="history-status">ابھی تک کوئی دستاویز محفوظ نہیں ہوئی۔ ایک دستاویز جنریٹ کریں تاکہ یہاں دیکھ سکیں۔</p>
        )}
        <div className="letter-history-list">
          {letterHistory.map((docItem) => (
            <div key={docItem.id} className="history-item-card">
              <h3>{docItem.category} ({docItem.type === 'letter' ? 'خط' : 'ای میل'}) - {docItem.language}</h3>
              <p className="history-description">تفصیل: {docItem.description}</p>
              <p className="history-timestamp">محفوظ کیا گیا: {docItem.timestamp && docItem.timestamp.toDate ? new Date(docItem.timestamp.toDate()).toLocaleString() : new Date(docItem.timestamp).toLocaleString()}</p>
              <pre className="history-content">{docItem.content.substring(0, 200)}...</pre>
              <div className="history-item-actions">
                <button
                  onClick={() => setGeneratedContent(docItem.content)}
                  className="view-full-letter-button"
                >
                  <FileText size={16} /> مکمل {docItem.type === 'letter' ? 'خط' : 'ای میل'} دیکھیں
                </button>
                <button
                  onClick={() => deleteDocument(docItem.id)}
                  className="delete-letter-button"
                >
                  <Trash2 size={16} /> حذف کریں
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <footer className="app-footer">
        <p>&copy; {new Date().getFullYear()} کوئیک لیٹر AI جنریٹر۔ تمام حقوق محفوظ ہیں۔</p>
        <p>بذریعہ محمد عمر شیراز</p>
      </footer>
    </div>
  );
}

export default App;
