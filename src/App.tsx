import React, { useState, useEffect, useMemo } from 'react';
import { 
  Layout, Smartphone, Table, Zap, CheckCircle2, Sparkles, 
  ShieldCheck, ShieldAlert, Copy, LogIn, Settings, Send, Plus, 
  TrendingUp, TrendingDown, Wallet, Calendar, List, Info,
  LogOut, RefreshCcw, Target, X
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { GoogleGenAI } from "@google/genai";
import { auth, db } from './firebase';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider,
  User
} from 'firebase/auth';
import { 
  doc, 
  onSnapshot, 
  setDoc, 
  Timestamp
} from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}


const formatCurrency = (val: number) => {
  return val.toLocaleString('en-IN', { 
    style: 'currency', 
    currency: 'INR',
    maximumFractionDigits: 0
  });
};

const COLORS = ['#000000', '#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  return (
    <TapSheetApp />
  );
}

function TapSheetApp() {
  const webhookUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/log` : '';
  const [tokens, setTokens] = useState<any>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(true);
  const [sheetId, setSheetId] = useState(localStorage.getItem('tap_sheet_id') || '');
  const [budget, setBudget] = useState(Number(localStorage.getItem('tap_budget')) || 50000);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'transactions' | 'analytics' | 'goals' | 'budget' | 'ai' | 'setup' | 'settings'>('dashboard');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [testText, setTestText] = useState('');
  const [isLogging, setIsLogging] = useState(false);

  // Categories & Filters
  const [categories, setCategories] = useState<string[]>(JSON.parse(localStorage.getItem('tap_categories') || '["Food", "Transport", "Shopping", "Entertainment", "Health", "Bills", "Housing", "Income", "Other"]'));
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    category: 'All',
    type: 'All'
  });

  // Pro Features State
  const [goals, setGoals] = useState<any[]>(JSON.parse(localStorage.getItem('tap_goals') || '[]'));
  const [envelopes, setEnvelopes] = useState<any[]>(JSON.parse(localStorage.getItem('tap_envelopes') || '[]'));
  const [bills, setBills] = useState<any[]>(JSON.parse(localStorage.getItem('tap_bills') || '[]'));
  const [assets, setAssets] = useState<any[]>(JSON.parse(localStorage.getItem('tap_assets') || '[]'));
  const [liabilities, setLiabilities] = useState<any[]>(JSON.parse(localStorage.getItem('tap_liabilities') || '[]'));
  const [chatMessages, setChatMessages] = useState<any[]>([
    { id: 'initial', role: 'model', text: "Hi! I'm your personal AI financial advisor. I have full context of your budget, spending, and goals. How can I help you save more today? 💬" }
  ]);
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<{ old: string, new: string } | null>(null);
  const [showModal, setShowModal] = useState<'goal' | 'bill' | 'envelope' | 'asset' | 'liability' | null>(null);
  const [modalData, setModalData] = useState<any>({});

  // Default data if empty
  useEffect(() => {
    if (goals.length === 0) {
      const defaultGoals = [
        { id: '1', icon: '✈️', title: 'Vacation Fund', target: 300000, saved: 216000, color: '#3b82f6' },
        { id: '2', icon: '🏠', title: 'House Down Payment', target: 5000000, saved: 1200000, color: '#22c55e' },
        { id: '3', icon: '💻', title: 'New MacBook', target: 250000, saved: 75000, color: '#8b5cf6' }
      ];
      setGoals(defaultGoals);
      localStorage.setItem('tap_goals', JSON.stringify(defaultGoals));
    }
    if (envelopes.length === 0) {
      const defaultEnvelopes = [
        { id: '1', icon: '🍔', name: 'Food & Dining', budget: 15000, category: 'Food' },
        { id: '2', icon: '🚕', name: 'Transport', budget: 5000, category: 'Transport' },
        { id: '3', icon: '🛍️', name: 'Shopping', budget: 10000, category: 'Shopping' },
        { id: '4', icon: '🎬', name: 'Entertainment', budget: 5000, category: 'Entertainment' }
      ];
      setEnvelopes(defaultEnvelopes);
      localStorage.setItem('tap_envelopes', JSON.stringify(defaultEnvelopes));
    }
    if (bills.length === 0) {
      const defaultBills = [
        { id: '1', date: '28', month: 'MAR', name: 'Electricity', amount: 2400, status: 'soon' },
        { id: '2', date: '01', month: 'APR', name: 'Rent', amount: 25000, status: 'paid' },
        { id: '3', date: '05', month: 'APR', name: 'Internet', amount: 1200, status: 'pending' }
      ];
      setBills(defaultBills);
      localStorage.setItem('tap_bills', JSON.stringify(defaultBills));
    }
    if (assets.length === 0) {
      const defaultAssets = [
        { id: '1', name: 'Savings Account', value: 500000 },
        { id: '2', name: 'Mutual Funds', value: 1200000 },
        { id: '3', name: 'Gold', value: 800000 }
      ];
      setAssets(defaultAssets);
      localStorage.setItem('tap_assets', JSON.stringify(defaultAssets));
    }
    if (liabilities.length === 0) {
      const defaultLiabilities = [
        { id: '1', name: 'Personal Loan', value: 150000 },
        { id: '2', name: 'Credit Card', value: 45000 }
      ];
      setLiabilities(defaultLiabilities);
      localStorage.setItem('tap_liabilities', JSON.stringify(defaultLiabilities));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSendMessage = async (textOverride?: string) => {
    const messageText = textOverride || aiInput;
    if (!messageText || isAiLoading) return;

    const newUserMessage = { id: Date.now().toString(), role: 'user', text: messageText };
    setChatMessages(prev => [...prev, newUserMessage]);
    setAiInput('');
    setIsAiLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-3-flash-preview";
      
      const context = `
        You are a personal financial advisor for TapSheet. 
        User's Current Finances:
        - Balance: ₹${stats.balance}
        - Monthly Income: ₹${stats.income}
        - Monthly Expenses: ₹${stats.expense}
        - Budget Limit: ₹${budget}
        - Available Categories: ${categories.join(', ')}
        - Top Spending Categories: ${categoryData.map(c => `${c.name}: ₹${c.value}`).join(', ')}
        - Savings Goals: ${goals.map(g => `${g.title}: ₹${g.saved}/₹${g.target}`).join(', ')}
        - Net Worth: ₹${netWorth.toLocaleString()}
        
        Recent Transactions:
        ${transactions.slice(0, 10).map(t => `${t.date}: ${t.merchant} - ₹${t.amount} (${t.category})`).join('\n')}

        Be concise, encouraging, and provide actionable advice. Use emojis.
      `;

      const response = await ai.models.generateContent({
        model,
        contents: [
          { role: 'user', parts: [{ text: context }] },
          ...chatMessages.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
          { role: 'user', parts: [{ text: messageText }] }
        ]
      });

      const aiText = response.text || "I'm sorry, I couldn't process that. Please try again.";
      setChatMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'model', text: aiText }]);
    } catch (error) {
      console.error(error);
      setChatMessages(prev => [...prev, { id: (Date.now() + 2).toString(), role: 'model', text: "Oops! I'm having trouble connecting right now. 🔌" }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleSaveGoal = () => {
    if (!modalData.title || !modalData.target) return;
    const newGoal = {
      id: modalData.id || Math.random().toString(36).substr(2, 9),
      icon: modalData.icon || '🎯',
      title: modalData.title,
      target: Number(modalData.target),
      saved: Number(modalData.saved || 0),
      color: modalData.color || COLORS[Math.floor(Math.random() * COLORS.length)]
    };
    
    let updated;
    if (modalData.id) {
      updated = goals.map(g => g.id === modalData.id ? newGoal : g);
    } else {
      updated = [...goals, newGoal];
    }
    
    setGoals(updated);
    saveConfigToFirestore({ goals: updated });
    localStorage.setItem('tap_goals', JSON.stringify(updated));
    setShowModal(null);
    setModalData({});
  };

  const handleDeleteGoal = (id: string) => {
    const updated = goals.filter(g => g.id !== id);
    setGoals(updated);
    saveConfigToFirestore({ goals: updated });
    localStorage.setItem('tap_goals', JSON.stringify(updated));
    setShowModal(null);
  };

  const handleSaveEnvelope = () => {
    if (!modalData.name || !modalData.budget) return;
    const newEnv = {
      id: modalData.id || Math.random().toString(36).substr(2, 9),
      icon: modalData.icon || '💰',
      name: modalData.name,
      budget: Number(modalData.budget),
      category: modalData.category || modalData.name
    };
    const updated = modalData.id 
      ? envelopes.map(e => e.id === modalData.id ? newEnv : e)
      : [...envelopes, newEnv];
    setEnvelopes(updated);
    saveConfigToFirestore({ envelopes: updated });
    localStorage.setItem('tap_envelopes', JSON.stringify(updated));
    setShowModal(null);
    setModalData({});
  };



  const handleSaveCategory = (name: string, oldName?: string) => {
    if (!name) return;
    let updated;
    if (oldName) {
      if (name === oldName) return;
      updated = categories.map(c => c === oldName ? name : c);
      setEnvelopes(prev => prev.map(e => e.category === oldName ? { ...e, category: name } : e));
      setTransactions(prev => prev.map(t => t.category === oldName ? { ...t, category: name } : t));
    } else {
      if (categories.includes(name)) return;
      updated = [...categories, name];
    }
    setCategories(updated);
    localStorage.setItem('tap_categories', JSON.stringify(updated));
    saveConfigToFirestore({ categories: updated });
  };

  const handleDeleteCategory = (name: string) => {
    const updated = categories.filter(c => c !== name);
    setCategories(updated);
    localStorage.setItem('tap_categories', JSON.stringify(updated));
    saveConfigToFirestore({ categories: updated });
  };

  const handleSaveAsset = () => {
    if (!modalData.name || !modalData.value) return;
    const newItem = {
      id: modalData.id || Math.random().toString(36).substr(2, 9),
      name: modalData.name,
      value: Number(modalData.value)
    };
    const updated = modalData.id 
      ? assets.map(a => a.id === modalData.id ? newItem : a)
      : [...assets, newItem];
    setAssets(updated);
    saveConfigToFirestore({ assets: updated });
    localStorage.setItem('tap_assets', JSON.stringify(updated));
    setShowModal(null);
    setModalData({});
  };

  const handleSaveLiability = () => {
    if (!modalData.name || !modalData.value) return;
    const newItem = {
      id: modalData.id || Math.random().toString(36).substr(2, 9),
      name: modalData.name,
      value: Number(modalData.value)
    };
    const updated = modalData.id 
      ? liabilities.map(l => l.id === modalData.id ? newItem : l)
      : [...liabilities, newItem];
    setLiabilities(updated);
    saveConfigToFirestore({ liabilities: updated });
    localStorage.setItem('tap_liabilities', JSON.stringify(updated));
    setShowModal(null);
    setModalData({});
  };

  const handleReallocate = (fromId: string, toId: string, amount: number) => {
    const updated = envelopes.map(env => {
      if (env.id === fromId) return { ...env, budget: env.budget - amount };
      if (env.id === toId) return { ...env, budget: env.budget + amount };
      return env;
    });
    setEnvelopes(updated);
    saveConfigToFirestore({ envelopes: updated });
    localStorage.setItem('tap_envelopes', JSON.stringify(updated));
  };

  const netWorth = useMemo(() => {
    const totalAssets = assets.reduce((acc, a) => acc + a.value, 0);
    const totalLiabilities = liabilities.reduce((acc, l) => acc + l.value, 0);
    return totalAssets - totalLiabilities;
  }, [assets, liabilities]);

  const envelopeStats = useMemo(() => {
    return envelopes.map(env => {
      const spent = transactions
        .filter(t => t.type === 'expense' && t.category.toLowerCase().includes(env.category.toLowerCase()))
        .reduce((acc, t) => acc + t.amount, 0);
      return { ...env, spent };
    });
  }, [envelopes, transactions]);

  // Firebase Auth & Firestore Sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        if (user.email !== "akulkhanna81304@gmail.com") {
          setIsAuthorized(false);
          auth.signOut();
          setUser(null);
        } else {
          setUser(user);
          setIsAuthorized(true);
        }
      } else {
        setUser(null);
        // Do not reset isAuthorized to true if they were just kicked out
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isAuthReady && user) {
      const userDocRef = doc(db, 'users', user.uid);
      const unsubscribe = onSnapshot(userDocRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data.goals) setGoals(data.goals);
          if (data.envelopes) setEnvelopes(data.envelopes);
          if (data.bills) setBills(data.bills);
          if (data.assets) setAssets(data.assets);
          if (data.liabilities) setLiabilities(data.liabilities);
          if (data.budget) setBudget(data.budget);
          if (data.sheetId) setSheetId(data.sheetId);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
      });
      return () => unsubscribe();
    }
  }, [isAuthReady, user]);

  const saveConfigToFirestore = async (updates: any) => {
    if (!user) return;
    try {
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, {
        ...updates,
        uid: user.uid,
        updatedAt: Timestamp.now()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  };

  // Listen for OAuth success from popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_SUCCESS') {
        setTokens(event.data.tokens);
        localStorage.setItem('tap_tokens', JSON.stringify(event.data.tokens));
      }
    };
    window.addEventListener('message', handleMessage);
    
    const saved = localStorage.getItem('tap_tokens');
    if (saved) setTokens(JSON.parse(saved));
    
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Sync config to sheet & Firestore
  const configString = JSON.stringify({ goals, envelopes, bills, assets, liabilities, budget, categories });
  useEffect(() => {
    if (tokens && sheetId && user) {
      const config = JSON.parse(configString);
      const lastSaved = localStorage.getItem('tap_last_sync');
      const now = Date.now();
      
      // Throttled sync (every 30 seconds)
      if (!lastSaved || now - Number(lastSaved) > 30000) {
        saveConfigToSheet(config);
        saveConfigToFirestore({ ...config, sheetId });
        localStorage.setItem('tap_last_sync', now.toString());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configString, tokens, sheetId, user]);

  const saveConfigToSheet = async (config: any) => {
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, sheetId, tokens }),
      });
    } catch (error) {
      console.error("Sync Error:", error);
    }
  };

  const loadConfigFromSheet = async () => {
    if (!tokens || !sheetId) return;
    try {
      const res = await fetch(`/api/config?sheetId=${sheetId}&tokens=${encodeURIComponent(JSON.stringify(tokens))}`);
      const data = await res.json();
      if (data.config) {
        const { goals: g, envelopes: e, bills: b, assets: a, liabilities: l, budget: bud, categories: cats } = data.config;
        if (g) setGoals(g);
        if (e) setEnvelopes(e);
        if (b) setBills(b);
        if (a) setAssets(a);
        if (l) setLiabilities(l);
        if (bud) setBudget(bud);
        if (cats) setCategories(cats);
      }
    } catch (error) {
      console.error("Load Config Error:", error);
    }
  };

  useEffect(() => {
    if (tokens && sheetId) {
      fetchTransactions();
      loadConfigFromSheet();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, sheetId]);

  const fetchTransactions = async () => {
    if (!tokens || !sheetId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/transactions?sheetId=${sheetId}&tokens=${encodeURIComponent(JSON.stringify(tokens))}`);
      const data = await res.json();
      if (data.transactions) setTransactions(data.transactions);
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async () => {
    try {
      // 1. Firebase Auth (only if not already signed in)
      if (!user) {
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
        return; // Return early so user can click again for Step 2
      }

      // 2. Google Sheets OAuth
      // Open popup immediately to bypass popup blocker
      const authWindow = window.open('', 'oauth_popup', 'width=600,height=700');
      
      const res = await fetch('/api/auth/url');
      const data = await res.json();
      
      if (data.error) {
        if (authWindow) authWindow.close();
        alert(`Configuration Error: ${data.error}\n${data.details || ''}`);
        return;
      }
      
      if (authWindow && !authWindow.closed) {
        authWindow.location.href = data.url;
      } else {
        window.open(data.url, 'oauth_popup', 'width=600,height=700');
      }
    } catch (error: any) {
      console.error(error);
      alert(`Authentication failed: ${error.message || 'Unknown error'}`);
    }
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
      setTokens(null);
      localStorage.removeItem('tap_tokens');
    } catch (error) {
      console.error(error);
    }
  };

  const handleSaveSheetId = (id: string) => {
    setSheetId(id);
    saveConfigToFirestore({ sheetId: id });
    localStorage.setItem('tap_sheet_id', id);
  };

  const handleManualLog = async () => {
    if (!sheetId || !tokens || !testText) return;
    setIsLogging(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-3-flash-preview";
      
      let logData = { 
        amount: 0, 
        merchant: "Manual Log", 
        category: "Other", 
        date: new Date().toISOString().split('T')[0], 
        type: "expense" 
      };

      const prompt = `
        Analyze this bank notification or message text. 
        Extract the following into JSON:
        { 
          "amount": number, 
          "merchant": string, 
          "category": string, 
          "date": "YYYY-MM-DD", 
          "type": "income" | "expense" 
        }
        
        Available Categories: ${categories.join(', ')}

        Rules:
        - If the money is received, credited, deposited, or added, type is "income".
        - If the money is spent, debited, paid, or withdrawn, type is "expense".
        - For merchant, look for names after "Info:", "at", "to", or "POS*".
        - If merchant is not clear, use "Unknown".
        - If category is not clear, pick the best fit from the Available Categories list.
        - Ensure the amount is a number (remove currency symbols like Rs, $, ₹).
        
        Text: "${testText}"
      `;

      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
        }
      });

      const parsed = JSON.parse(response.text || "{}");
      logData = { ...logData, ...parsed };

      await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logData, sheetId, tokens }),
      });
      setTestText('');
      fetchTransactions();
    } catch (error) {
      console.error(error);
    } finally {
      setIsLogging(false);
    }
  };



  const stats = useMemo(() => {
    const income = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const expense = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
    const savingsRate = income > 0 ? ((income - expense) / income) * 100 : 0;
    
    // Financial Health Score Logic
    let healthScore = 50;
    if (savingsRate > 20) healthScore += 10;
    if (savingsRate < 0) healthScore -= 10;
    if (expense < budget * 0.8) healthScore += 10;
    if (expense > budget) healthScore -= 10;
    if (netWorth > 0) healthScore += 10;
    if (bills.every(b => b.status === 'paid')) healthScore += 10;
    if (goals.some(g => (g.saved / g.target) > 0.5)) healthScore += 10;
    
    return {
      income,
      expense,
      balance: income - expense,
      budgetProgress: (expense / budget) * 100,
      savingsRate: Math.max(0, Math.min(100, savingsRate)),
      healthScore: Math.max(0, Math.min(100, healthScore))
    };
  }, [transactions, budget, netWorth, bills, goals]);

  const categoryData = useMemo(() => {
    const categories: Record<string, number> = {};
    transactions.filter(t => t.type === 'expense').forEach(t => {
      categories[t.category] = (categories[t.category] || 0) + t.amount;
    });
    return Object.entries(categories).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const matchesType = filters.type === 'All' || t.type === filters.type.toLowerCase();
      const matchesCategory = filters.category === 'All' || t.category === filters.category;
      const matchesStartDate = !filters.startDate || new Date(t.date) >= new Date(filters.startDate);
      const matchesEndDate = !filters.endDate || new Date(t.date) <= new Date(filters.endDate);
      return matchesType && matchesCategory && matchesStartDate && matchesEndDate;
    });
  }, [transactions, filters]);

  const aiInsight = useMemo(() => {
    if (transactions.length === 0) return "Start logging to see AI insights!";
    const topCategory = categoryData[0]?.name || "N/A";
    const budgetStatus = stats.budgetProgress > 80 ? "⚠️ Careful! You're almost at your limit." : "✅ Your spending is healthy this month.";
    return `${budgetStatus} Your biggest expense is ${topCategory}.`;
  }, [transactions, categoryData, stats.budgetProgress]);

  const chartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    return last7Days.map(date => {
      const dayTransactions = transactions.filter(t => t.date === date);
      return {
        date: date.split('-').slice(1).join('/'),
        expense: dayTransactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0),
        income: dayTransactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0),
      };
    });
  }, [transactions]);

  if (!isAuthReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A]">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-white border-t-transparent" />
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A] p-6">
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-red-500/10 text-red-500 shadow-2xl shadow-red-500/10">
            <ShieldAlert size={40} />
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-black tracking-tighter text-white">Access Denied</h1>
            <p className="text-gray-400">This is a private instance of TapSheet. Access is restricted to the owner only.</p>
          </div>
          <button 
            onClick={() => setIsAuthorized(true)}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-8 py-4 font-bold text-black transition-all hover:scale-[1.02] active:scale-95"
          >
            Try Another Account
          </button>
        </div>
      </div>
    );
  }

  if (!tokens || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0A0A0A] p-6">
        <div className="w-full max-w-md space-y-8 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-white text-black shadow-2xl shadow-white/10">
            <Zap size={40} fill="currentColor" />
          </div>
          <div className="space-y-4">
            <h1 className="text-5xl font-black tracking-tighter text-white">TapSheet</h1>
            <p className="text-gray-400">The free, AI-powered finance ledger that lives in your Google Sheets.</p>
          </div>
          <button 
            onClick={handleConnect}
            className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-white px-8 py-4 font-bold text-black transition-all hover:scale-[1.02] active:scale-95"
          >
            <LogIn size={20} />
            {!user ? "Step 1: Sign in with Google" : "Step 2: Connect Google Sheets"}
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-black/5 to-transparent transition-transform group-hover:translate-x-full" />
          </button>
          <div className="flex items-center justify-center gap-6 text-xs font-medium uppercase tracking-widest text-gray-500">
            <span className="flex items-center gap-1"><ShieldCheck size={12} /> Secure</span>
            <span className="flex items-center gap-1"><Zap size={12} /> Real-time</span>
            <span className="flex items-center gap-1"><Table size={12} /> Google Sheets</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F9FAFB]">
      {/* Sidebar - Desktop */}
      <aside className="hidden w-72 border-r border-gray-200 bg-white p-6 lg:flex lg:flex-col">
        <div className="flex items-center gap-3 mb-10">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black text-white">
            <Zap size={20} fill="currentColor" />
          </div>
          <span className="text-xl font-bold tracking-tight">TapSheet</span>
        </div>

        <nav className="flex-1 space-y-1">
          <div className="px-3 mb-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Overview</div>
          <NavItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<Layout size={18} />} label="Dashboard" />
          <NavItem active={activeTab === 'transactions'} onClick={() => setActiveTab('transactions')} icon={<List size={18} />} label="Transactions" />
          <NavItem active={activeTab === 'analytics'} onClick={() => setActiveTab('analytics')} icon={<TrendingUp size={18} />} label="Analytics" />
          
          <div className="px-3 mt-6 mb-2 text-[10px] font-black uppercase tracking-widest text-gray-400">Planning</div>
          <NavItem active={activeTab === 'goals'} onClick={() => setActiveTab('goals')} icon={<Target size={18} />} label="Goals & Net Worth" />
          <NavItem active={activeTab === 'budget'} onClick={() => setActiveTab('budget')} icon={<Wallet size={18} />} label="Budget & Bills" />
          <NavItem active={activeTab === 'ai'} onClick={() => setActiveTab('ai')} icon={<Sparkles size={18} />} label="AI Advisor" />
          
          <div className="px-3 mt-6 mb-2 text-[10px] font-black uppercase tracking-widest text-gray-400">System</div>
          <NavItem active={activeTab === 'setup'} onClick={() => setActiveTab('setup')} icon={<Settings size={18} />} label="Setup Guide" />
          <NavItem active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} icon={<Settings size={18} />} label="Settings" />
        </nav>

        <div className="mt-auto pt-6 border-t border-gray-100">
          <div className="flex items-center gap-3 mb-4 p-2">
            <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
              <Table size={16} className="text-gray-400" />
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-bold truncate">Connected Sheet</p>
              <p className="text-[10px] text-gray-400 truncate">{sheetId || 'Not set'}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-red-500 transition-colors hover:bg-red-50">
            <LogOut size={18} /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-24 lg:pb-12">
        {/* Header */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-100 bg-white/80 px-6 py-4 backdrop-blur-md lg:px-10">
          <h2 className="text-xl font-bold capitalize">{activeTab}</h2>
          <div className="flex items-center gap-3">
            <button 
              onClick={fetchTransactions}
              className={cn("p-2 rounded-lg hover:bg-gray-100 transition-all", isLoading && "animate-spin")}
            >
              <RefreshCcw size={18} />
            </button>
            <div className="h-8 w-8 rounded-full bg-black flex items-center justify-center text-white text-xs font-bold">
              {tokens?.email?.[0]?.toUpperCase() || 'U'}
            </div>
          </div>
        </header>

        <div className="p-6 lg:p-10 max-w-6xl mx-auto">
          {activeTab === 'dashboard' && (
            <div className="space-y-8">
              {/* Hero Banner */}
              <div className="relative overflow-hidden rounded-[2rem] bg-black p-8 text-white shadow-2xl lg:p-12">
                <div className="relative z-10 flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-green-400">
                      <div className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
                      Remaining to Spend
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-light text-white/40">₹</span>
                      <span className="text-7xl font-black tracking-tighter">
                        {(stats.balance).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-white/80 backdrop-blur-md">
                        <TrendingUp size={12} className="text-green-400" />
                        Income: ₹{stats.income.toLocaleString()}
                      </div>
                      <div className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-white/80 backdrop-blur-md">
                        <TrendingDown size={12} className="text-red-400" />
                        Expenses: ₹{stats.expense.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 text-right">
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/40">Financial Health</div>
                    <div className="text-5xl font-black text-green-400">{stats.healthScore}</div>
                    <div className="text-[10px] font-bold text-white/60">
                      {stats.healthScore > 70 ? 'Excellent' : stats.healthScore > 40 ? 'Good' : 'Needs Work'}
                    </div>
                  </div>
                </div>

                <div className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <div className="rounded-2xl bg-white/5 p-4 backdrop-blur-sm">
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Net Worth</div>
                    <div className="text-xl font-bold">₹{netWorth.toLocaleString()}</div>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-4 backdrop-blur-sm">
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Savings Rate</div>
                    <div className="text-xl font-bold">{Math.round(stats.savingsRate)}%</div>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-4 backdrop-blur-sm">
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Upcoming Bills</div>
                    <div className="text-xl font-bold">{bills.filter(b => b.status !== 'paid').length}</div>
                  </div>
                  <div className="rounded-2xl bg-white/5 p-4 backdrop-blur-sm">
                    <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Active Goals</div>
                    <div className="text-xl font-bold">{goals.length}</div>
                  </div>
                </div>

                {/* Decorative Elements */}
                <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-green-500/10 blur-[100px]" />
                <div className="absolute -bottom-20 left-1/4 h-64 w-64 rounded-full bg-blue-500/10 blur-[100px]" />
              </div>

              <div className="grid gap-8 lg:grid-cols-3">
                {/* Left Column: Charts & Insights */}
                <div className="lg:col-span-2 space-y-8">
                  {/* AI Coach & Budget Progress */}
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="group rounded-[2rem] border border-gray-100 bg-white p-8 shadow-sm transition-all hover:shadow-md">
                      <div className="flex items-center gap-2 mb-4 text-purple-600">
                        <Sparkles size={20} className="animate-pulse" />
                        <h3 className="font-bold">AI Savings Coach</h3>
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed">{aiInsight}</p>
                      <div className="mt-6 pt-6 border-t border-gray-50">
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">
                          <span>Monthly Budget</span>
                          <span>{Math.round(stats.budgetProgress)}%</span>
                        </div>
                        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className={cn(
                              "h-full transition-all duration-1000",
                              stats.budgetProgress > 90 ? "bg-red-500" : stats.budgetProgress > 70 ? "bg-orange-500" : "bg-black"
                            )}
                            style={{ width: `${Math.min(stats.budgetProgress, 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="group rounded-[2rem] border border-gray-100 bg-white p-8 shadow-sm transition-all hover:shadow-md">
                      <h3 className="font-bold text-lg mb-6">Category Split</h3>
                      <div className="h-40 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={categoryData}
                              cx="50%"
                              cy="50%"
                              innerRadius={50}
                              outerRadius={70}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {categoryData.map((entry) => (
                                <Cell key={entry.name} fill={COLORS[categoryData.indexOf(entry) % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip 
                              contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Trend Chart */}
                  <div className="rounded-[2.5rem] border border-gray-100 bg-white p-8 shadow-sm">
                    <div className="flex items-center justify-between mb-8">
                      <div>
                        <h3 className="font-bold text-xl tracking-tight">Spending Trend</h3>
                        <p className="text-xs text-gray-400 mt-1">Daily activity for the last 7 days</p>
                      </div>
                      <div className="flex gap-4 text-[10px] font-black uppercase tracking-widest text-gray-400">
                        <span className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-black" /> Expense</span>
                        <span className="flex items-center gap-1"><div className="h-2 w-2 rounded-full bg-green-500" /> Income</span>
                      </div>
                    </div>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#000" stopOpacity={0.1}/>
                              <stop offset="95%" stopColor="#000" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.1}/>
                              <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                          <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 600, fill: '#94A3B8'}} dy={10} />
                          <YAxis hide />
                          <Tooltip 
                            contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                            itemStyle={{fontWeight: 700, fontSize: '12px'}}
                          />
                          <Area type="monotone" dataKey="expense" stroke="#000" strokeWidth={3} fillOpacity={1} fill="url(#colorExpense)" />
                          <Area type="monotone" dataKey="income" stroke="#22c55e" strokeWidth={3} fillOpacity={1} fill="url(#colorIncome)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Right Column: Actions & Logs */}
                <div className="space-y-8">
                  <div className="rounded-[2rem] bg-[#111] p-8 text-white shadow-xl">
                    <h3 className="mb-6 flex items-center gap-2 font-bold text-lg">
                      <Plus size={20} className="text-green-400" /> Quick Log
                    </h3>
                    <div className="space-y-4">
                      <textarea 
                        value={testText}
                        onChange={(e) => setTestText(e.target.value)}
                        placeholder="e.g., Spent 500 on groceries"
                        className="w-full rounded-2xl bg-white/5 p-4 text-sm placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-white/10 transition-all"
                        rows={3}
                      />
                      <button 
                        onClick={handleManualLog}
                        disabled={isLogging || !testText}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-4 font-bold text-black transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                      >
                        {isLogging ? <RefreshCcw className="animate-spin" size={18} /> : <Send size={18} />}
                        Log to Sheet
                      </button>
                    </div>
                  </div>

                  <div className="rounded-[2rem] border border-gray-100 bg-white p-8 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="font-bold text-lg">Recent Logs</h3>
                      <button onClick={() => setActiveTab('transactions')} className="text-xs font-black uppercase tracking-widest text-blue-500 hover:text-blue-600">View All</button>
                    </div>
                    <div className="space-y-4">
                      {transactions.slice(0, 5).map((t) => (
                        <TransactionItem key={t.id} transaction={t} />
                      ))}
                      {transactions.length === 0 && (
                        <div className="py-10 text-center text-gray-400 italic text-sm">No transactions yet.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'transactions' && (
            <div className="space-y-6">
              <div className="rounded-3xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="grid gap-4 md:grid-cols-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Type</label>
                    <select 
                      value={filters.type}
                      onChange={(e) => setFilters({ ...filters, type: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs font-bold focus:outline-none"
                    >
                      <option>All</option>
                      <option>Income</option>
                      <option>Expense</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Category</label>
                    <select 
                      value={filters.category}
                      onChange={(e) => setFilters({ ...filters, category: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs font-bold focus:outline-none"
                    >
                      <option>All</option>
                      {categories.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">From</label>
                    <input 
                      type="date" 
                      value={filters.startDate}
                      onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs font-bold focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">To</label>
                    <input 
                      type="date" 
                      value={filters.endDate}
                      onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                      className="mt-1 w-full rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs font-bold focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                <div className="p-8 border-b border-gray-50 flex items-center justify-between">
                  <h3 className="font-bold text-lg">All Transactions</h3>
                  <div className="flex gap-2">
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-bold text-gray-500">{filteredTransactions.length} Filtered</span>
                    <span className="rounded-full bg-black px-3 py-1 text-xs font-bold text-white">{transactions.length} Total</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-gray-50/50 text-[10px] font-black uppercase tracking-widest text-gray-400">
                        <th className="px-8 py-4">Date</th>
                        <th className="px-8 py-4">Merchant</th>
                        <th className="px-8 py-4">Category</th>
                        <th className="px-8 py-4 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredTransactions.map((t) => (
                        <tr key={t.id} className="group hover:bg-gray-50/50 transition-colors">
                          <td className="px-8 py-4 text-sm font-medium text-gray-500">{t.date}</td>
                          <td className="px-8 py-4">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "h-8 w-8 rounded-lg flex items-center justify-center",
                                t.type === 'income' ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
                              )}>
                                {t.type === 'income' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                              </div>
                              <span className="text-sm font-bold">{t.merchant}</span>
                            </div>
                          </td>
                          <td className="px-8 py-4">
                            <span className="rounded-full bg-gray-100 px-3 py-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">{t.category}</span>
                          </td>
                          <td className={cn(
                            "px-8 py-4 text-right text-sm font-black",
                            t.type === 'income' ? "text-green-600" : "text-black"
                          )}>
                            {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                          </td>
                        </tr>
                      ))}
                      {filteredTransactions.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-8 py-12 text-center text-gray-400 italic text-sm">No transactions match your filters.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="space-y-8">
              <div className="grid gap-8 lg:grid-cols-2">
                <div className="rounded-[2.5rem] border border-gray-100 bg-white p-8 shadow-sm">
                  <h3 className="font-bold text-xl mb-6">Spending by Category</h3>
                  <div className="flex items-center gap-8">
                    <div className="h-64 w-64 shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {categoryData.map((entry) => (
                              <Cell key={entry.name} fill={COLORS[categoryData.indexOf(entry) % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-3">
                      {categoryData.map((cat, i) => (
                        <div key={cat.name} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <span className="font-bold text-gray-600">{cat.name}</span>
                          </div>
                          <span className="font-black">₹{cat.value.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-[2.5rem] border border-gray-100 bg-white p-8 shadow-sm">
                  <h3 className="font-bold text-xl mb-6">Daily Spending</h3>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 600, fill: '#94A3B8'}} />
                        <YAxis hide />
                        <Tooltip 
                          cursor={{fill: '#F8FAFC'}}
                          contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                        />
                        <Bar dataKey="expense" fill="#000" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'goals' && (
            <div className="space-y-8">
              <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-blue-600 to-indigo-700 p-10 text-white shadow-2xl">
                <div className="relative z-10">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-200 mb-2">Total Net Worth</div>
                  <div className="text-6xl font-black tracking-tighter mb-4">₹{netWorth.toLocaleString('en-IN')}</div>
                  <div className="flex items-center gap-2 text-sm font-bold text-blue-100">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
                      <TrendingUp size={12} />
                    </div>
                    {netWorth > 0 ? 'Positive Growth' : 'Action Required'}
                  </div>
                </div>
                <div className="absolute -right-10 -top-10 h-64 w-64 rounded-full bg-white/10 blur-[80px]" />
              </div>

              {/* Net Worth Chart */}
              <div className="rounded-[2.5rem] border border-gray-100 bg-white p-8 shadow-sm">
                <h3 className="font-bold text-xl mb-6">Net Worth Analysis</h3>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { name: 'Assets', value: assets.reduce((acc, a) => acc + a.value, 0), fill: '#22c55e' },
                      { name: 'Liabilities', value: liabilities.reduce((acc, l) => acc + l.value, 0), fill: '#ef4444' },
                      { name: 'Net Worth', value: netWorth, fill: '#3b82f6' }
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 700, fill: '#64748B'}} />
                      <YAxis hide />
                      <Tooltip 
                        cursor={{fill: '#F8FAFC'}}
                        contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                      />
                      <Bar dataKey="value" radius={[12, 12, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid gap-8 lg:grid-cols-2">
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-xl">Savings Goals</h3>
                    <button 
                      onClick={() => { setModalData({}); setShowModal('goal'); }}
                      className="text-xs font-black uppercase tracking-widest text-blue-500"
                    >
                      + Add Goal
                    </button>
                  </div>
                  <div className="grid gap-6 sm:grid-cols-2">
                    {goals.map(goal => (
                      <GoalCard 
                        key={goal.id} 
                        icon={goal.icon} 
                        title={goal.title} 
                        target={goal.target} 
                        saved={goal.saved} 
                        color={goal.color} 
                        onClick={() => { setModalData(goal); setShowModal('goal'); }}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-6">
                  <h3 className="font-bold text-xl">Assets & Liabilities</h3>
                  <div className="rounded-[2rem] border border-gray-100 bg-white p-8 shadow-sm">
                    <div className="space-y-6">
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-xs font-black uppercase tracking-widest text-green-500">Assets</h4>
                          <button onClick={() => { setModalData({}); setShowModal('asset'); }} className="text-[10px] font-bold text-gray-400">+</button>
                        </div>
                        <div className="space-y-3">
                          {assets.map(a => (
                            <div key={a.id} className="flex items-center justify-between text-sm">
                              <span className="font-bold text-gray-600">{a.name}</span>
                              <span className="font-black">₹{a.value.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="pt-6 border-t border-gray-50">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-xs font-black uppercase tracking-widest text-red-500">Liabilities</h4>
                          <button onClick={() => { setModalData({}); setShowModal('liability'); }} className="text-[10px] font-bold text-gray-400">+</button>
                        </div>
                        <div className="space-y-3">
                          {liabilities.map(l => (
                            <div key={l.id} className="flex items-center justify-between text-sm">
                              <span className="font-bold text-gray-600">{l.name}</span>
                              <span className="font-black text-red-500">₹{l.value.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'budget' && (
            <div className="space-y-8">
              <div className="grid gap-8 lg:grid-cols-2">
                <div className="rounded-[2.5rem] border border-gray-100 bg-white p-8 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-xl">Spending Envelopes</h3>
                    <button onClick={() => { setModalData({}); setShowModal('envelope'); }} className="text-xs font-black uppercase tracking-widest text-blue-500">+ Add</button>
                  </div>
                  <div className="space-y-6">
                    {envelopeStats.map(env => (
                      <EnvelopeItem 
                        key={env.id} 
                        icon={env.icon} 
                        name={env.name} 
                        budget={env.budget} 
                        spent={env.spent} 
                        onClick={() => { setModalData(env); setShowModal('envelope'); }}
                      />
                    ))}
                  </div>

                  {/* Interactive Reallocation */}
                  {envelopes.length >= 2 && (
                    <div className="mt-10 rounded-2xl border border-dashed border-gray-200 p-6 bg-gray-50/50">
                      <h4 className="text-sm font-bold mb-4 flex items-center gap-2">
                        <RefreshCcw size={14} /> Quick Reallocate
                      </h4>
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex-1 min-w-[120px]">
                          <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Amount</label>
                          <input 
                            type="number" 
                            placeholder="500" 
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold"
                            id="reallocateAmount"
                          />
                        </div>
                        <div className="flex-1 min-w-[120px]">
                          <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">From</label>
                          <select id="fromEnv" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold">
                            {envelopes.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                          </select>
                        </div>
                        <div className="flex-1 min-w-[120px]">
                          <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">To</label>
                          <select id="toEnv" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold">
                            {envelopes.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                          </select>
                        </div>
                        <div className="pt-5">
                          <button 
                            onClick={() => {
                              const amount = Number((document.getElementById('reallocateAmount') as HTMLInputElement).value);
                              const from = (document.getElementById('fromEnv') as HTMLSelectElement).value;
                              const to = (document.getElementById('toEnv') as HTMLSelectElement).value;
                              if (amount > 0 && from !== to) handleReallocate(from, to, amount);
                            }}
                            className="rounded-lg bg-black px-6 py-2 text-xs font-bold text-white hover:bg-gray-800 transition-all active:scale-95"
                          >
                            Transfer
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-8">
                  <div className="rounded-[2.5rem] border border-gray-100 bg-white p-8 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="font-bold text-xl">Upcoming Bills</h3>
                      <button onClick={() => { setModalData({}); setShowModal('bill'); }} className="text-xs font-black uppercase tracking-widest text-blue-500">+ Add</button>
                    </div>
                    <div className="space-y-4">
                      {bills.map(bill => (
                        <BillItem 
                          key={bill.id} 
                          date={bill.date} 
                          month={bill.month} 
                          name={bill.name} 
                          amount={bill.amount} 
                          status={bill.status} 
                          onClick={() => { setModalData(bill); setShowModal('bill'); }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="flex flex-col h-[calc(100vh-12rem)]">
              <div className="flex items-center gap-4 mb-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-green-400 to-green-600 text-white shadow-lg">
                  <Sparkles size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold">AI Financial Advisor</h2>
                  <p className="text-xs text-green-600 font-bold">● Online · Powered by Gemini</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 mb-6 pr-4">
                {chatMessages.map((msg) => (
                  <div key={msg.id} className={cn("flex gap-3 max-w-[80%]", msg.role === 'user' && "ml-auto flex-row-reverse")}>
                    <div className={cn(
                      "h-8 w-8 rounded-xl flex items-center justify-center shrink-0",
                      msg.role === 'model' ? "bg-green-100 text-green-600" : "bg-black text-white"
                    )}>
                      {msg.role === 'model' ? <Sparkles size={16} /> : <div className="text-[10px] font-bold">ME</div>}
                    </div>
                    <div className={cn(
                      "rounded-2xl p-4 text-sm shadow-sm border",
                      msg.role === 'model' 
                        ? "rounded-tl-none bg-white border-gray-100" 
                        : "rounded-tr-none bg-black text-white border-black"
                    )}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isAiLoading && (
                  <div className="flex gap-3 max-w-[80%]">
                    <div className="h-8 w-8 rounded-xl bg-green-100 flex items-center justify-center shrink-0 animate-pulse">
                      <Sparkles size={16} className="text-green-600" />
                    </div>
                    <div className="rounded-2xl rounded-tl-none bg-white p-4 text-sm shadow-sm border border-gray-100 italic text-gray-400">
                      Thinking...
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={() => handleSendMessage("Summarize my spending")}
                    className="rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all"
                  >
                    📊 Summarize my spending
                  </button>
                  <button 
                    onClick={() => handleSendMessage("Give me tips to save more")}
                    className="rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all"
                  >
                    💡 Tips to save more
                  </button>
                  <button 
                    onClick={() => handleSendMessage("Am I on track for my goals?")}
                    className="rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all"
                  >
                    🎯 Am I on track for goals?
                  </button>
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Ask about your finances..."
                    className="flex-1 rounded-2xl border border-gray-100 bg-white px-6 py-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500/20"
                  />
                  <button 
                    onClick={() => handleSendMessage()}
                    disabled={isAiLoading || !aiInput}
                    className="flex h-14 w-14 items-center justify-center rounded-2xl bg-black text-white shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                  >
                    {isAiLoading ? <RefreshCcw size={20} className="animate-spin" /> : <Send size={20} />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-2xl space-y-8">
              <div className="rounded-[2.5rem] border border-gray-100 bg-white p-8 shadow-sm">
                <h3 className="font-bold text-xl mb-8">Preferences</h3>
                <div className="space-y-6">
                  <ToggleItem icon={<Zap size={18} />} title="Smart Nudges" desc="Get alerts when spending spikes" active />
                  <ToggleItem icon={<TrendingUp size={18} />} title="Weekly Report" desc="Email summary every Sunday" active />
                  <ToggleItem icon={<Calendar size={18} />} title="Bill Reminders" desc="Alert 3 days before due date" active />
                  <ToggleItem icon={<ShieldCheck size={18} />} title="Biometric Lock" desc="Require Face ID / fingerprint" />
                </div>
              </div>

              <div className="rounded-[2.5rem] border border-gray-100 bg-white p-8 shadow-sm">
                <h3 className="font-bold text-xl mb-6">Manage Categories</h3>
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      placeholder="New category name..."
                      className="flex-1 rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm font-bold focus:outline-none"
                    />
                    <button 
                      onClick={() => { handleSaveCategory(newCategoryName); setNewCategoryName(''); }}
                      className="rounded-xl bg-black px-6 py-3 text-xs font-bold text-white transition-all active:scale-95"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {categories.map(c => (
                      <div key={c} className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-xs font-bold text-gray-700">
                        {editingCategory?.old === c ? (
                          <input 
                            autoFocus
                            value={editingCategory.new}
                            onChange={(e) => setEditingCategory({ ...editingCategory, new: e.target.value })}
                            onBlur={() => { handleSaveCategory(editingCategory.new, editingCategory.old); setEditingCategory(null); }}
                            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                            className="bg-transparent border-none focus:outline-none w-20"
                          />
                        ) : (
                          <span onClick={() => setEditingCategory({ old: c, new: c })} className="cursor-pointer hover:text-black">{c}</span>
                        )}
                        <button 
                          onClick={() => handleDeleteCategory(c)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <button onClick={handleLogout} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 py-4 font-bold text-red-500 transition-all hover:bg-red-100">
                <LogOut size={18} /> Logout from TapSheet
              </button>
            </div>
          )}
          {activeTab === 'setup' && (
            <div className="space-y-8">
              {/* Sheet Configuration */}
              <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-2xl bg-orange-50 text-orange-500 flex items-center justify-center">
                    <Table size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg leading-none">Google Sheet Configuration</h3>
                    <p className="text-xs text-gray-400 mt-1">Connect your ledger to start logging.</p>
                  </div>
                </div>
                <div className="grid gap-8 md:grid-cols-2">
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Google Sheet ID</label>
                      <input 
                        type="text" 
                        value={sheetId}
                        onChange={(e) => handleSaveSheetId(e.target.value)}
                        placeholder="Paste ID from URL"
                        className="mt-1 w-full rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-black/5"
                      />
                    </div>
                    <div className="rounded-2xl bg-blue-50 p-4 flex gap-3">
                      <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
                      <p className="text-xs leading-relaxed text-blue-700">
                        Find the ID in your sheet URL: <br />
                        <code>/spreadsheets/d/<strong>[THIS_PART]</strong>/edit</code>
                      </p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-dashed border-gray-200 p-6 flex flex-col items-center justify-center text-center">
                    <CheckCircle2 size={32} className={cn("mb-3", sheetId ? "text-green-500" : "text-gray-200")} />
                    <p className="text-sm font-bold">{sheetId ? "Sheet Connected" : "No Sheet Connected"}</p>
                    <p className="text-xs text-gray-400 mt-1 max-w-[200px]">
                      {sheetId ? "Your transactions will be logged to this sheet automatically." : "Enter your Sheet ID to enable logging and dashboard stats."}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl bg-black p-10 text-white shadow-2xl">
                <div className="max-w-2xl">
                  <h2 className="mb-4 text-3xl font-black tracking-tight">Automation Setup</h2>
                  <p className="mb-8 text-gray-400">Connect your iPhone to TapSheet to log expenses automatically from bank SMS notifications.</p>
                  
                  <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">Your Unique Webhook URL</label>
                    <div className="flex items-center gap-2 rounded-2xl bg-white/10 p-2 pl-4">
                      <code className="flex-1 overflow-hidden text-ellipsis text-xs text-green-400">{webhookUrl}</code>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(webhookUrl);
                          alert('Copied to clipboard!');
                        }}
                        className="rounded-xl bg-white/10 p-3 transition-colors hover:bg-white/20"
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-8 md:grid-cols-2">
                <div className="rounded-3xl border border-gray-200 bg-white p-8">
                  <h3 className="mb-6 flex items-center gap-2 text-xl font-bold">
                    <Smartphone size={20} className="text-blue-500" /> iPhone Automation
                  </h3>
                  <div className="space-y-6 text-sm text-gray-500">
                    <Step num="1" title="The Trigger" text="Shortcuts → Automation → + → Message. Set Sender to your bank ID (e.g., ICICIB) and check Run Immediately." />
                    <Step num="2" title="The Action" text="Add 'Get Contents of URL'. Paste Webhook URL, set Method to POST." />
                    <Step num="3" title="The Data" text="Add JSON Body field 'text' with value 'Shortcut Input'." />
                    <Step num="4" title="Finalize" text="Turn OFF 'Ask Before Running' and tap Done." />
                  </div>
                </div>

                <div className="rounded-3xl border border-gray-200 bg-white p-8">
                  <h3 className="mb-6 flex items-center gap-2 text-xl font-bold">
                    <Info size={20} className="text-orange-500" /> Pro Tips
                  </h3>
                  <div className="space-y-4">
                    <Tip icon={<Layout className="text-blue-500" />} title="Add to Home Screen" text="Open in Safari → Share → Add to Home Screen for a native app feel." />
                    <Tip icon={<Sparkles className="text-purple-500" />} title="AI Parsing" text="Our AI handles complex SMS formats, currency symbols, and merchant detection." />
                    <Tip icon={<ShieldCheck className="text-green-500" />} title="Privacy First" text="Data flows directly to your Google Sheet. We don't store your history." />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-gray-100 bg-white/80 p-4 pb-8 backdrop-blur-lg lg:hidden">
        <MobileNavItem active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<Layout size={20} />} label="Home" />
        <MobileNavItem active={activeTab === 'analytics'} onClick={() => setActiveTab('analytics')} icon={<TrendingUp size={20} />} label="Charts" />
        <div className="flex -translate-y-6 items-center justify-center">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className="flex h-14 w-14 items-center justify-center rounded-[1.25rem] bg-black text-white shadow-2xl shadow-black/40 transition-all active:scale-90"
          >
            <Plus size={28} />
          </button>
        </div>
        <MobileNavItem active={activeTab === 'goals'} onClick={() => setActiveTab('goals')} icon={<Target size={20} />} label="Goals" />
        <MobileNavItem active={activeTab === 'ai'} onClick={() => setActiveTab('ai')} icon={<Sparkles size={20} />} label="AI" />
      </nav>

      {/* Modals */}
      {showModal === 'goal' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2.5rem] bg-white p-8 shadow-2xl">
            <h3 className="text-2xl font-black tracking-tight mb-6">{modalData.id ? 'Edit Goal' : 'New Savings Goal'}</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Goal Title</label>
                <input 
                  type="text" 
                  value={modalData.title || ''}
                  onChange={(e) => setModalData({ ...modalData, title: e.target.value })}
                  placeholder="e.g., New Car"
                  className="mt-1 w-full rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-black/5"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Target Amount</label>
                  <input 
                    type="number" 
                    value={modalData.target || ''}
                    onChange={(e) => setModalData({ ...modalData, target: e.target.value })}
                    placeholder="₹5,00,000"
                    className="mt-1 w-full rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-black/5"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Already Saved</label>
                  <input 
                    type="number" 
                    value={modalData.saved || ''}
                    onChange={(e) => setModalData({ ...modalData, saved: e.target.value })}
                    placeholder="₹50,000"
                    className="mt-1 w-full rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-black/5"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Icon (Emoji)</label>
                <input 
                  type="text" 
                  value={modalData.icon || ''}
                  onChange={(e) => setModalData({ ...modalData, icon: e.target.value })}
                  placeholder="🎯"
                  className="mt-1 w-full rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-black/5"
                />
              </div>
            </div>
            <div className="mt-8 flex gap-3">
              <button 
                onClick={() => setShowModal(null)}
                className="flex-1 rounded-2xl bg-gray-100 py-4 font-bold text-gray-500 transition-all hover:bg-gray-200"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveGoal}
                className="flex-[2] rounded-2xl bg-black py-4 font-bold text-white transition-all hover:scale-[1.02] active:scale-95 shadow-xl shadow-black/20"
              >
                Save Goal
              </button>
            </div>
            {modalData.id && (
              <button 
                onClick={() => handleDeleteGoal(modalData.id)}
                className="mt-4 w-full text-xs font-bold text-red-500 hover:underline"
              >
                Delete Goal
              </button>
            )}
          </div>
        </div>
      )}

      {showModal === 'envelope' && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2.5rem] bg-white p-8 shadow-2xl">
            <h3 className="text-2xl font-black tracking-tight mb-6">{modalData.id ? 'Edit Envelope' : 'New Envelope'}</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Name</label>
                <input 
                  type="text" 
                  value={modalData.name || ''}
                  onChange={(e) => setModalData({ ...modalData, name: e.target.value })}
                  placeholder="e.g., Dining Out"
                  className="mt-1 w-full rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-black/5"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Monthly Budget</label>
                <input 
                  type="number" 
                  value={modalData.budget || ''}
                  onChange={(e) => setModalData({ ...modalData, budget: e.target.value })}
                  placeholder="₹10,000"
                  className="mt-1 w-full rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-black/5"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Category Tag (for tracking)</label>
                <select 
                  value={modalData.category || ''}
                  onChange={(e) => setModalData({ ...modalData, category: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-black/5"
                >
                  <option value="">Select Category</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-8 flex gap-3">
              <button onClick={() => setShowModal(null)} className="flex-1 rounded-2xl bg-gray-100 py-4 font-bold text-gray-500">Cancel</button>
              <button onClick={handleSaveEnvelope} className="flex-[2] rounded-2xl bg-black py-4 font-bold text-white">Save</button>
            </div>
          </div>
        </div>
      )}

      {(showModal === 'asset' || showModal === 'liability') && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[2.5rem] bg-white p-8 shadow-2xl">
            <h3 className="text-2xl font-black tracking-tight mb-6">Add {showModal}</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Name</label>
                <input 
                  type="text" 
                  value={modalData.name || ''}
                  onChange={(e) => setModalData({ ...modalData, name: e.target.value })}
                  placeholder="e.g., Savings"
                  className="mt-1 w-full rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-black/5"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Value</label>
                <input 
                  type="number" 
                  value={modalData.value || ''}
                  onChange={(e) => setModalData({ ...modalData, value: e.target.value })}
                  placeholder="₹1,00,000"
                  className="mt-1 w-full rounded-xl border border-gray-100 bg-gray-50 p-4 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-black/5"
                />
              </div>
            </div>
            <div className="mt-8 flex gap-3">
              <button onClick={() => setShowModal(null)} className="flex-1 rounded-2xl bg-gray-100 py-4 font-bold text-gray-500">Cancel</button>
              <button onClick={showModal === 'asset' ? handleSaveAsset : handleSaveLiability} className="flex-[2] rounded-2xl bg-black py-4 font-bold text-white">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all",
        active ? "bg-black text-white shadow-lg shadow-black/10" : "text-gray-500 hover:bg-gray-50 hover:text-black"
      )}
    >
      {icon} {label}
    </button>
  );
}

function MobileNavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 transition-all",
        active ? "text-black" : "text-gray-400"
      )}
    >
      {icon}
      <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
    </button>
  );
}

function GoalCard({ icon, title, target, saved, color, onClick }: { icon: string, title: string, target: number, saved: number, color: string, onClick?: () => void, key?: any }) {
  const pct = Math.round((saved / target) * 100);
  return (
    <div onClick={onClick} className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm cursor-pointer hover:border-gray-200 transition-all">
      <div className="flex items-center justify-between mb-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl text-2xl" style={{ backgroundColor: `${color}15` }}>
          {icon}
        </div>
        <div className="text-right">
          <div className="text-xl font-black" style={{ color }}>{pct}%</div>
          <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Complete</div>
        </div>
      </div>
      <h4 className="font-bold text-gray-900 mb-1">{title}</h4>
      <div className="text-xs text-gray-400 mb-4">₹{saved.toLocaleString()} of ₹{target.toLocaleString()}</div>
      <div className="h-2 w-full bg-gray-50 rounded-full overflow-hidden">
        <div className="h-full transition-all duration-1000" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function EnvelopeItem({ icon, name, budget, spent, onClick }: { icon: string, name: string, budget: number, spent: number, onClick?: () => void, key?: any }) {
  const pct = Math.min(100, Math.round((spent / budget) * 100));
  const isOver = spent > budget;
  return (
    <div onClick={onClick} className="space-y-2 cursor-pointer group">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">{icon}</span>
          <span className="text-sm font-bold text-gray-700">{name}</span>
        </div>
        <div className="text-right">
          <div className={cn("text-sm font-black", isOver ? "text-red-500" : "text-gray-900")}>
            ₹{spent.toLocaleString()}
          </div>
          <div className="text-[10px] font-bold text-gray-400">of ₹{budget.toLocaleString()}</div>
        </div>
      </div>
      <div className="h-2 w-full bg-gray-50 rounded-full overflow-hidden">
        <div className={cn("h-full transition-all duration-1000", isOver ? "bg-red-500" : "bg-green-500")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function BillItem({ date, month, name, amount, status, onClick }: { date: string, month: string, name: string, amount: number, status: 'soon' | 'paid' | 'pending', onClick?: () => void, key?: any }) {
  return (
    <div onClick={onClick} className="flex items-center justify-between p-4 rounded-2xl bg-gray-50/50 border border-gray-100 cursor-pointer hover:bg-gray-100 transition-all">
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center justify-center h-12 w-12 rounded-xl bg-white shadow-sm border border-gray-100">
          <span className="text-sm font-black leading-none">{date}</span>
          <span className="text-[8px] font-black text-gray-400 mt-1">{month}</span>
        </div>
        <div>
          <div className="text-sm font-bold">{name}</div>
          <div className={cn(
            "text-[10px] font-black uppercase tracking-widest mt-1",
            status === 'paid' ? "text-green-500" : status === 'soon' ? "text-orange-500" : "text-gray-400"
          )}>
            {status}
          </div>
        </div>
      </div>
      <div className="text-sm font-black">₹{amount.toLocaleString()}</div>
    </div>
  );
}

function ToggleItem({ icon, title, desc, active = false }: { icon: React.ReactNode, title: string, desc: string, active?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 text-gray-400">
          {icon}
        </div>
        <div>
          <div className="text-sm font-bold">{title}</div>
          <div className="text-xs text-gray-400">{desc}</div>
        </div>
      </div>
      <button className={cn(
        "h-6 w-11 rounded-full p-1 transition-all",
        active ? "bg-green-500" : "bg-gray-200"
      )}>
        <div className={cn(
          "h-4 w-4 rounded-full bg-white transition-all",
          active ? "translate-x-5" : "translate-x-0"
        )} />
      </button>
    </div>
  );
}

function TransactionItem({ transaction }: { transaction: any, key?: any }) {
  return (
    <div className="flex items-center justify-between group">
      <div className="flex items-center gap-4">
        <div className={cn(
          "h-10 w-10 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110",
          transaction.type === 'income' ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"
        )}>
          {transaction.type === 'income' ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
        </div>
        <div>
          <p className="text-sm font-bold">{transaction.merchant}</p>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{transaction.category}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={cn("text-sm font-black", transaction.type === 'income' ? "text-green-600" : "text-black")}>
          {transaction.type === 'income' ? '+' : '-'}{formatCurrency(transaction.amount)}
        </p>
        <p className="text-[10px] font-bold text-gray-400">{transaction.date}</p>
      </div>
    </div>
  );
}

function Step({ num, title, text }: { num: string, title: string, text: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-black">{num}</div>
      <div>
        <p className="font-bold text-black">{title}</p>
        <p className="text-xs leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

function Tip({ icon, title, text }: { icon: React.ReactNode, title: string, text: string }) {
  return (
    <div className="flex gap-4">
      <div className="shrink-0 mt-1">{icon}</div>
      <div>
        <p className="text-sm font-bold text-black">{title}</p>
        <p className="text-xs leading-relaxed text-gray-400">{text}</p>
      </div>
    </div>
  );
}
