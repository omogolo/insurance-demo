require('dotenv').config();
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Customer = require('../models/Customer');
const Policy = require('../models/Policy');
const Statement = require('../models/Statement');

// ─── 15 Synthetic Customers ────────────────────────────────────────────────────

const customers = [
  {
    customerId: 'CUS-0001',
    name: 'Rajesh Kumar',
    phone: '+919876543210',
    email: 'rajesh.kumar@email.com',
    dateOfBirth: '1985-03-15',
    address: { street: '42, MG Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' },
    occupation: 'Software Engineer'
  },
  {
    customerId: 'CUS-0002',
    name: 'Priya Sharma',
    phone: '+919876543211',
    email: 'priya.sharma@email.com',
    dateOfBirth: '1990-07-22',
    address: { street: '15, Park Street', city: 'Kolkata', state: 'West Bengal', pincode: '700016' },
    occupation: 'Chartered Accountant'
  },
  {
    customerId: 'CUS-0003',
    name: 'Amit Patel',
    phone: '+919876543212',
    email: 'amit.patel@email.com',
    dateOfBirth: '1988-11-08',
    address: { street: '78, CG Road', city: 'Ahmedabad', state: 'Gujarat', pincode: '380006' },
    occupation: 'Business Owner'
  },
  {
    customerId: 'CUS-0004',
    name: 'Sneha Reddy',
    phone: '+919876543213',
    email: 'sneha.reddy@email.com',
    dateOfBirth: '1992-01-30',
    address: { street: '23, Jubilee Hills', city: 'Hyderabad', state: 'Telangana', pincode: '500033' },
    occupation: 'Doctor'
  },
  {
    customerId: 'CUS-0005',
    name: 'Vikram Singh',
    phone: '+919876543214',
    email: 'vikram.singh@email.com',
    dateOfBirth: '1982-06-12',
    address: { street: '56, Civil Lines', city: 'Jaipur', state: 'Rajasthan', pincode: '302006' },
    occupation: 'Government Officer'
  },
  {
    customerId: 'CUS-0006',
    name: 'Ananya Iyer',
    phone: '+919876543215',
    email: 'ananya.iyer@email.com',
    dateOfBirth: '1995-09-18',
    address: { street: '8, Anna Nagar', city: 'Chennai', state: 'Tamil Nadu', pincode: '600040' },
    occupation: 'Data Analyst'
  },
  {
    customerId: 'CUS-0007',
    name: 'Arjun Nair',
    phone: '+919876543216',
    email: 'arjun.nair@email.com',
    dateOfBirth: '1987-04-05',
    address: { street: '31, MG Road', city: 'Kochi', state: 'Kerala', pincode: '682016' },
    occupation: 'Marine Engineer'
  },
  {
    customerId: 'CUS-0008',
    name: 'Kavitha Menon',
    phone: '+919876543217',
    email: 'kavitha.menon@email.com',
    dateOfBirth: '1991-12-25',
    address: { street: '12, Banerjee Road', city: 'Kochi', state: 'Kerala', pincode: '682018' },
    occupation: 'Teacher'
  },
  {
    customerId: 'CUS-0009',
    name: 'Suresh Gupta',
    phone: '+919876543218',
    email: 'suresh.gupta@email.com',
    dateOfBirth: '1978-08-14',
    address: { street: '99, Lajpat Nagar', city: 'New Delhi', state: 'Delhi', pincode: '110024' },
    occupation: 'Retired Bank Manager'
  },
  {
    customerId: 'CUS-0010',
    name: 'Meera Joshi',
    phone: '+919876543219',
    email: 'meera.joshi@email.com',
    dateOfBirth: '1993-02-28',
    address: { street: '45, Koregaon Park', city: 'Pune', state: 'Maharashtra', pincode: '411001' },
    occupation: 'Product Manager'
  },
  {
    customerId: 'CUS-0011',
    name: 'Deepak Verma',
    phone: '+919876543220',
    email: 'deepak.verma@email.com',
    dateOfBirth: '1984-10-09',
    address: { street: '67, Arera Colony', city: 'Bhopal', state: 'Madhya Pradesh', pincode: '462011' },
    occupation: 'Civil Contractor'
  },
  {
    customerId: 'CUS-0012',
    name: 'Pooja Desai',
    phone: '+919876543221',
    email: 'pooja.desai@email.com',
    dateOfBirth: '1989-05-17',
    address: { street: '21, Shivaji Nagar', city: 'Pune', state: 'Maharashtra', pincode: '411005' },
    occupation: 'Lawyer'
  },
  {
    customerId: 'CUS-0013',
    name: 'Rahul Mehta',
    phone: '+919876543222',
    email: 'rahul.mehta@email.com',
    dateOfBirth: '1994-07-03',
    address: { street: '14, Bandra West', city: 'Mumbai', state: 'Maharashtra', pincode: '400050' },
    occupation: 'Financial Analyst'
  },
  {
    customerId: 'CUS-0014',
    name: 'Lakshmi Narayan',
    phone: '+919876543223',
    email: 'lakshmi.narayan@email.com',
    dateOfBirth: '1975-11-20',
    address: { street: '88, T Nagar', city: 'Chennai', state: 'Tamil Nadu', pincode: '600017' },
    occupation: 'Homemaker'
  },
  {
    customerId: 'CUS-0015',
    name: 'Karthik Rajan',
    phone: '+919876543224',
    email: 'karthik.rajan@email.com',
    dateOfBirth: '1990-03-08',
    address: { street: '33, HSR Layout', city: 'Bengaluru', state: 'Karnataka', pincode: '560102' },
    occupation: 'Startup Founder'
  }
];

// ─── Policies (35 total across 15 customers) ───────────────────────────────────

const policies = [
  // Rajesh Kumar — 3 policies
  {
    policyId: 'POL-LIF-0001', customerId: 'CUS-0001', type: 'Life', status: 'Active',
    premium: { amount: 18500, frequency: 'Yearly' },
    sumInsured: 5000000,
    coverageDetails: { nominee: 'Meena Kumar', nomineeRelation: 'Spouse', termYears: 25, maturityBenefit: 6250000 },
    startDate: '2022-01-15', endDate: '2047-01-14', nextPremiumDue: '2025-01-15',
    claims: []
  },
  {
    policyId: 'POL-VEH-0001', customerId: 'CUS-0001', type: 'Vehicle', status: 'Active',
    premium: { amount: 8200, frequency: 'Yearly' },
    sumInsured: 850000,
    coverageDetails: { make: 'Hyundai', model: 'Creta SX', year: 2023, registrationNo: 'KA-01-MJ-4521', engineNo: 'G4LAH789012' },
    startDate: '2023-06-10', endDate: '2024-06-09', nextPremiumDue: '2025-06-10',
    claims: [{ claimId: 'CLM-0001', filedDate: '2024-02-15', amount: 35000, status: 'Settled', description: 'Rear bumper damage in parking lot', settledDate: '2024-03-10', settledAmount: 32000 }]
  },
  {
    policyId: 'POL-HLT-0001', customerId: 'CUS-0001', type: 'Health', status: 'Active',
    premium: { amount: 14500, frequency: 'Yearly' },
    sumInsured: 1000000,
    coverageDetails: { networkType: 'Cashless', preExistingDiseases: [], roomRentLimit: '1% of SI', deductible: 0 },
    startDate: '2023-04-01', endDate: '2024-03-31', nextPremiumDue: '2025-04-01',
    claims: []
  },

  // Priya Sharma — 2 policies
  {
    policyId: 'POL-HLT-0002', customerId: 'CUS-0002', type: 'Health', status: 'Active',
    premium: { amount: 22000, frequency: 'Yearly' },
    sumInsured: 1500000,
    coverageDetails: { networkType: 'Cashless', preExistingDiseases: ['Hypothyroidism'], roomRentLimit: 'No limit', deductible: 5000 },
    startDate: '2022-07-01', endDate: '2025-06-30', nextPremiumDue: '2025-07-01',
    claims: [{ claimId: 'CLM-0002', filedDate: '2024-05-20', amount: 85000, status: 'Approved', description: 'Laparoscopic gallbladder surgery at Apollo Hospitals', settledDate: null, settledAmount: null }]
  },
  {
    policyId: 'POL-PRP-0001', customerId: 'CUS-0002', type: 'Property', status: 'Active',
    premium: { amount: 4500, frequency: 'Yearly' },
    sumInsured: 8000000,
    coverageDetails: { propertyType: 'Apartment', areaSqFt: 1200, constructionType: 'RCC', locationRisk: 'Low' },
    startDate: '2023-01-01', endDate: '2024-12-31', nextPremiumDue: '2025-01-01',
    claims: []
  },

  // Amit Patel — 1 policy
  {
    policyId: 'POL-VEH-0002', customerId: 'CUS-0003', type: 'Vehicle', status: 'Active',
    premium: { amount: 12800, frequency: 'Yearly' },
    sumInsured: 1200000,
    coverageDetails: { make: 'Toyota', model: 'Fortuner 4x2', year: 2022, registrationNo: 'GJ-01-AB-7890', engineNo: '1GDFTV456789' },
    startDate: '2024-01-05', endDate: '2025-01-04', nextPremiumDue: '2025-01-05',
    claims: []
  },

  // Sneha Reddy — 3 policies
  {
    policyId: 'POL-LIF-0002', customerId: 'CUS-0004', type: 'Life', status: 'Active',
    premium: { amount: 25000, frequency: 'Yearly' },
    sumInsured: 10000000,
    coverageDetails: { nominee: 'Ramesh Reddy', nomineeRelation: 'Father', termYears: 30, maturityBenefit: 15000000 },
    startDate: '2021-09-20', endDate: '2051-09-19', nextPremiumDue: '2025-09-20',
    claims: []
  },
  {
    policyId: 'POL-HLT-0003', customerId: 'CUS-0004', type: 'Health', status: 'Active',
    premium: { amount: 18000, frequency: 'Yearly' },
    sumInsured: 2000000,
    coverageDetails: { networkType: 'Cashless', preExistingDiseases: [], roomRentLimit: '2% of SI', deductible: 0 },
    startDate: '2023-04-01', endDate: '2025-03-31', nextPremiumDue: '2025-04-01',
    claims: [{ claimId: 'CLM-0003', filedDate: '2024-08-12', amount: 42000, status: 'Under Review', description: 'Dengue fever hospitalization at KIMS', settledDate: null, settledAmount: null }]
  },
  {
    policyId: 'POL-PRP-0002', customerId: 'CUS-0004', type: 'Property', status: 'Active',
    premium: { amount: 6800, frequency: 'Yearly' },
    sumInsured: 12000000,
    coverageDetails: { propertyType: 'Independent House', areaSqFt: 2500, constructionType: 'RCC', locationRisk: 'Low' },
    startDate: '2022-11-01', endDate: '2024-10-31', nextPremiumDue: '2025-11-01',
    claims: []
  },

  // Vikram Singh — 2 policies
  {
    policyId: 'POL-VEH-0003', customerId: 'CUS-0005', type: 'Vehicle', status: 'Lapsed',
    premium: { amount: 5500, frequency: 'Yearly' },
    sumInsured: 450000,
    coverageDetails: { make: 'Maruti Suzuki', model: 'Swift Dzire VXI', year: 2019, registrationNo: 'RJ-14-CD-3456', engineNo: 'K12M789012' },
    startDate: '2023-04-15', endDate: '2024-04-14', nextPremiumDue: null,
    claims: []
  },
  {
    policyId: 'POL-LIF-0003', customerId: 'CUS-0005', type: 'Life', status: 'Active',
    premium: { amount: 15000, frequency: 'Yearly' },
    sumInsured: 3000000,
    coverageDetails: { nominee: 'Kiran Singh', nomineeRelation: 'Spouse', termYears: 20, maturityBenefit: 3600000 },
    startDate: '2020-02-10', endDate: '2040-02-09', nextPremiumDue: '2025-02-10',
    claims: []
  },

  // Ananya Iyer — 1 policy
  {
    policyId: 'POL-HLT-0004', customerId: 'CUS-0006', type: 'Health', status: 'Active',
    premium: { amount: 9500, frequency: 'Yearly' },
    sumInsured: 500000,
    coverageDetails: { networkType: 'Reimbursement', preExistingDiseases: ['PCOS'], roomRentLimit: '1% of SI', deductible: 2000 },
    startDate: '2024-01-01', endDate: '2025-12-31', nextPremiumDue: '2025-01-01',
    claims: []
  },

  // Arjun Nair — 2 policies
  {
    policyId: 'POL-PRP-0003', customerId: 'CUS-0007', type: 'Property', status: 'Active',
    premium: { amount: 3200, frequency: 'Yearly' },
    sumInsured: 3500000,
    coverageDetails: { propertyType: 'Apartment', areaSqFt: 850, constructionType: 'RCC', locationRisk: 'Medium' },
    startDate: '2023-06-01', endDate: '2025-05-31', nextPremiumDue: '2025-06-01',
    claims: [{ claimId: 'CLM-0004', filedDate: '2024-07-22', amount: 120000, status: 'Settled', description: 'Water damage from monsoon flooding', settledDate: '2024-09-05', settledAmount: 105000 }]
  },
  {
    policyId: 'POL-VEH-0004', customerId: 'CUS-0007', type: 'Vehicle', status: 'Active',
    premium: { amount: 9800, frequency: 'Yearly' },
    sumInsured: 950000,
    coverageDetails: { make: 'Honda', model: 'City ZX CVT', year: 2023, registrationNo: 'KL-07-EF-5678', engineNo: 'L15BN234567' },
    startDate: '2024-02-20', endDate: '2025-02-19', nextPremiumDue: '2025-02-20',
    claims: []
  },

  // Kavitha Menon — 3 policies
  {
    policyId: 'POL-LIF-0004', customerId: 'CUS-0008', type: 'Life', status: 'Active',
    premium: { amount: 12000, frequency: 'Yearly' },
    sumInsured: 2500000,
    coverageDetails: { nominee: 'Ravi Menon', nomineeRelation: 'Spouse', termYears: 20, maturityBenefit: 3000000 },
    startDate: '2021-05-01', endDate: '2041-04-30', nextPremiumDue: '2025-05-01',
    claims: []
  },
  {
    policyId: 'POL-HLT-0005', customerId: 'CUS-0008', type: 'Health', status: 'Active',
    premium: { amount: 11000, frequency: 'Yearly' },
    sumInsured: 700000,
    coverageDetails: { networkType: 'Cashless', preExistingDiseases: [], roomRentLimit: '1% of SI', deductible: 0 },
    startDate: '2023-08-01', endDate: '2025-07-31', nextPremiumDue: '2025-08-01',
    claims: []
  },
  {
    policyId: 'POL-VEH-0005', customerId: 'CUS-0008', type: 'Vehicle', status: 'Active',
    premium: { amount: 4200, frequency: 'Yearly' },
    sumInsured: 550000,
    coverageDetails: { make: 'Maruti Suzuki', model: 'Baleno Zeta', year: 2021, registrationNo: 'KL-05-GH-9012', engineNo: 'K12C345678' },
    startDate: '2024-03-15', endDate: '2025-03-14', nextPremiumDue: '2025-03-15',
    claims: []
  },

  // Suresh Gupta — 1 policy
  {
    policyId: 'POL-PRP-0004', customerId: 'CUS-0009', type: 'Property', status: 'Active',
    premium: { amount: 5500, frequency: 'Yearly' },
    sumInsured: 15000000,
    coverageDetails: { propertyType: 'Independent House', areaSqFt: 3200, constructionType: 'RCC', locationRisk: 'Low' },
    startDate: '2020-01-01', endDate: '2025-12-31', nextPremiumDue: '2025-01-01',
    claims: []
  },

  // Meera Joshi — 2 policies
  {
    policyId: 'POL-HLT-0006', customerId: 'CUS-0010', type: 'Health', status: 'Active',
    premium: { amount: 16000, frequency: 'Yearly' },
    sumInsured: 1000000,
    coverageDetails: { networkType: 'Cashless', preExistingDiseases: [], roomRentLimit: 'No limit', deductible: 0 },
    startDate: '2023-01-01', endDate: '2025-12-31', nextPremiumDue: '2025-01-01',
    claims: [{ claimId: 'CLM-0005', filedDate: '2024-09-10', amount: 25000, status: 'Settled', description: 'Dental treatment and root canal at Smile Care', settledDate: '2024-10-02', settledAmount: 22000 }]
  },
  {
    policyId: 'POL-LIF-0005', customerId: 'CUS-0010', type: 'Life', status: 'Active',
    premium: { amount: 20000, frequency: 'Yearly' },
    sumInsured: 7500000,
    coverageDetails: { nominee: 'Ravi Joshi', nomineeRelation: 'Father', termYears: 30, maturityBenefit: 11250000 },
    startDate: '2023-11-15', endDate: '2053-11-14', nextPremiumDue: '2025-11-15',
    claims: []
  },

  // Deepak Verma — 3 policies
  {
    policyId: 'POL-VEH-0006', customerId: 'CUS-0011', type: 'Vehicle', status: 'Active',
    premium: { amount: 15000, frequency: 'Yearly' },
    sumInsured: 1800000,
    coverageDetails: { make: 'Tata', model: 'Safari XTA+', year: 2024, registrationNo: 'MP-04-IJ-3456', engineNo: '2.0LKRDi567890' },
    startDate: '2024-05-01', endDate: '2025-04-30', nextPremiumDue: '2025-05-01',
    claims: []
  },
  {
    policyId: 'POL-PRP-0005', customerId: 'CUS-0011', type: 'Property', status: 'Claimed',
    premium: { amount: 7200, frequency: 'Yearly' },
    sumInsured: 10000000,
    coverageDetails: { propertyType: 'Commercial Building', areaSqFt: 5000, constructionType: 'RCC', locationRisk: 'Medium' },
    startDate: '2021-04-01', endDate: '2026-03-31', nextPremiumDue: '2025-04-01',
    claims: [{ claimId: 'CLM-0006', filedDate: '2024-06-15', amount: 850000, status: 'Approved', description: 'Fire damage to ground floor storage area', settledDate: null, settledAmount: null }]
  },
  {
    policyId: 'POL-HLT-0007', customerId: 'CUS-0011', type: 'Health', status: 'Active',
    premium: { amount: 19000, frequency: 'Yearly' },
    sumInsured: 1500000,
    coverageDetails: { networkType: 'Cashless', preExistingDiseases: ['Diabetes Type 2'], roomRentLimit: '1.5% of SI', deductible: 3000 },
    startDate: '2023-07-01', endDate: '2025-06-30', nextPremiumDue: '2025-07-01',
    claims: []
  },

  // Pooja Desai — 1 policy
  {
    policyId: 'POL-LIF-0006', customerId: 'CUS-0012', type: 'Life', status: 'Active',
    premium: { amount: 32000, frequency: 'Yearly' },
    sumInsured: 15000000,
    coverageDetails: { nominee: 'Sunita Desai', nomineeRelation: 'Mother', termYears: 25, maturityBenefit: 20000000 },
    startDate: '2022-03-10', endDate: '2047-03-09', nextPremiumDue: '2025-03-10',
    claims: []
  },

  // Rahul Mehta — 2 policies
  {
    policyId: 'POL-VEH-0007', customerId: 'CUS-0013', type: 'Vehicle', status: 'Active',
    premium: { amount: 18500, frequency: 'Yearly' },
    sumInsured: 1500000,
    coverageDetails: { make: 'BMW', model: '3 Series 320d', year: 2022, registrationNo: 'MH-02-KL-7890', engineNo: 'B47D20123456' },
    startDate: '2024-01-20', endDate: '2025-01-19', nextPremiumDue: '2025-01-20',
    claims: [{ claimId: 'CLM-0007', filedDate: '2024-11-01', amount: 180000, status: 'Filed', description: 'Side swipe collision on Western Express Highway', settledDate: null, settledAmount: null }]
  },
  {
    policyId: 'POL-HLT-0008', customerId: 'CUS-0013', type: 'Health', status: 'Active',
    premium: { amount: 21000, frequency: 'Yearly' },
    sumInsured: 2000000,
    coverageDetails: { networkType: 'Cashless', preExistingDiseases: [], roomRentLimit: 'No limit', deductible: 0 },
    startDate: '2024-01-01', endDate: '2025-12-31', nextPremiumDue: '2025-01-01',
    claims: []
  },

  // Lakshmi Narayan — 1 policy
  {
    policyId: 'POL-PRP-0006', customerId: 'CUS-0014', type: 'Property', status: 'Active',
    premium: { amount: 4100, frequency: 'Yearly' },
    sumInsured: 6000000,
    coverageDetails: { propertyType: 'Apartment', areaSqFt: 1500, constructionType: 'RCC', locationRisk: 'Low' },
    startDate: '2022-06-01', endDate: '2025-05-31', nextPremiumDue: '2025-06-01',
    claims: []
  },

  // Karthik Rajan — 2 policies
  {
    policyId: 'POL-LIF-0007', customerId: 'CUS-0015', type: 'Life', status: 'Pending',
    premium: { amount: 28000, frequency: 'Yearly' },
    sumInsured: 10000000,
    coverageDetails: { nominee: 'Padma Rajan', nomineeRelation: 'Mother', termYears: 30, maturityBenefit: 14000000 },
    startDate: '2025-01-01', endDate: '2054-12-31', nextPremiumDue: '2026-01-01',
    claims: []
  },
  {
    policyId: 'POL-VEH-0008', customerId: 'CUS-0015', type: 'Vehicle', status: 'Active',
    premium: { amount: 7600, frequency: 'Yearly' },
    sumInsured: 780000,
    coverageDetails: { make: 'Kia', model: 'Seltos HTX', year: 2023, registrationNo: 'KA-05-MN-1234', engineNo: '1.4T-GDI567890' },
    startDate: '2024-04-10', endDate: '2025-04-09', nextPremiumDue: '2025-04-10',
    claims: []
  }
];

// ─── Statements (one per policy) ───────────────────────────────────────────────

function generateStatement(policy) {
  const startDate = new Date(policy.startDate);
  const now = new Date();
  const periodFrom = new Date(startDate);
  const periodTo = new Date(Math.min(now.getTime(), new Date(policy.endDate).getTime()));

  const transactions = [];
  let balance = 0;

  // Generate premium payment transactions
  const freqMonths = {
    'Monthly': 1, 'Quarterly': 3, 'Half-Yearly': 6, 'Yearly': 12
  };
  const interval = freqMonths[policy.premium.frequency] || 12;

  let current = new Date(periodFrom);
  while (current <= periodTo) {
    balance += policy.premium.amount;
    transactions.push({
      date: new Date(current),
      type: 'Premium Paid',
      description: `${policy.premium.frequency} premium for ${policy.type} policy ${policy.policyId}`,
      amount: policy.premium.amount,
      runningBalance: balance,
      referenceId: `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`
    });
    current.setMonth(current.getMonth() + interval);
  }

  // Add claim transactions
  if (policy.claims && policy.claims.length > 0) {
    for (const claim of policy.claims) {
      balance -= claim.amount;
      transactions.push({
        date: new Date(claim.filedDate),
        type: 'Claim Filed',
        description: claim.description,
        amount: -claim.amount,
        runningBalance: balance,
        referenceId: claim.claimId
      });

      if (claim.status === 'Settled' && claim.settledAmount) {
        balance += claim.settledAmount;
        transactions.push({
          date: new Date(claim.settledDate),
          type: 'Claim Settled',
          description: `Settlement for ${claim.claimId}`,
          amount: claim.settledAmount,
          runningBalance: balance,
          referenceId: `STL-${claim.claimId}`
        });
      }
    }
  }

  // Sort transactions by date
  transactions.sort((a, b) => a.date - b.date);

  // Recalculate running balances
  let runBal = 0;
  for (const txn of transactions) {
    runBal += txn.amount;
    txn.runningBalance = runBal;
  }

  const totalPremiumPaid = transactions
    .filter(t => t.type === 'Premium Paid')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalClaimsSettled = transactions
    .filter(t => t.type === 'Claim Settled')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalRefunds = transactions
    .filter(t => t.type === 'Refund')
    .reduce((sum, t) => sum + t.amount, 0);

  return {
    statementId: `STM-${policy.policyId.split('-').pop()}-${String(policies.indexOf(policy) + 1).padStart(4, '0')}`,
    policyId: policy.policyId,
    customerId: policy.customerId,
    period: { from: periodFrom, to: periodTo },
    transactions,
    summary: {
      totalPremiumPaid,
      totalClaimsSettled,
      totalRefunds,
      outstandingBalance: Math.max(0, runBal)
    },
    generatedAt: new Date()
  };
}

const statements = policies.map(p => generateStatement(p));

// ─── Seed Function ─────────────────────────────────────────────────────────────

async function seed() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('ERROR: MONGO_URI not set in .env');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    // Clear existing data
    await Customer.deleteMany({});
    await Policy.deleteMany({});
    await Statement.deleteMany({});
    console.log('Cleared existing collections');

    // Insert customers
    const insertedCustomers = await Customer.insertMany(customers);
    console.log(`Inserted ${insertedCustomers.length} customers`);

    // Insert policies
    const insertedPolicies = await Policy.insertMany(policies);
    console.log(`Inserted ${insertedPolicies.length} policies`);

    // Insert statements
    const insertedStatements = await Statement.insertMany(statements);
    console.log(`Inserted ${insertedStatements.length} statements`);

    // Summary
    console.log('\n── Seed Summary ──────────────────────');
    console.log(`Customers:  ${insertedCustomers.length}`);
    console.log(`Policies:   ${insertedPolicies.length}`);
    console.log(`  Life:     ${insertedPolicies.filter(p => p.type === 'Life').length}`);
    console.log(`  Vehicle:  ${insertedPolicies.filter(p => p.type === 'Vehicle').length}`);
    console.log(`  Health:   ${insertedPolicies.filter(p => p.type === 'Health').length}`);
    console.log(`  Property: ${insertedPolicies.filter(p => p.type === 'Property').length}`);
    console.log(`Statements: ${insertedStatements.length}`);
    console.log('──────────────────────────────────────\n');
    console.log('Seed completed successfully.');

  } catch (err) {
    console.error('Seed error:', err.message);
    if (err.code === 11000) {
      console.error('Duplicate key error — run seed again after clearing if needed.');
    }
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

seed();