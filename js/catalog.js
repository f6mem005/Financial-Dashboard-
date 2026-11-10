/* catalog.js — static option lists, typical defaults, and the question definitions.
   Pure data. The app renders screens from QUESTIONS; config.js turns answers into settings. */
(function (root) {
  'use strict';
  var FD = (root.FD = root.FD || {});

  var PAY_FREQ = [
    { id: 'weekly', label: 'Every week', perYear: 52 },
    { id: 'biweekly', label: 'Every 2 weeks', perYear: 26 },
    { id: 'twice', label: 'Twice a month', perYear: 24 },
    { id: 'monthly', label: 'Once a month', perYear: 12 },
    { id: 'varies', label: 'It varies (gig, tips, freelance)', perYear: 12 }
  ];

  // d = typical default amount, due = typical due day of month
  var OTHER_INCOME = [
    { id: 'side', label: 'Side hustle', d: 200 },
    { id: 'family', label: 'Family support', d: 150 },
    { id: 'aid', label: 'Financial aid', d: 300 },
    { id: 'benefits', label: 'Benefits', d: 200 }
  ];
  var BILLS = [
    { id: 'rent', label: 'Rent', d: 1100, due: 1 },
    { id: 'mortgage', label: 'Mortgage (home loan payment)', short: 'Mortgage', d: 1800, due: 1 },
    { id: 'hoa', label: 'HOA, condo or association dues', short: 'HOA / association dues', d: 300, due: 1 },
    { id: 'proptax', label: 'Property tax (if not in your mortgage payment)', short: 'Property tax', d: 350, due: 1 },
    { id: 'homeins', label: 'Home or renters insurance (if not in your mortgage payment)', short: 'Home / renters insurance', d: 120, due: 1 },
    { id: 'phone', label: 'Phone', d: 60, due: 15 },
    { id: 'carpay', label: 'Car payment', d: 300, due: 5 },
    { id: 'carins', label: 'Car insurance', d: 120, due: 10 },
    { id: 'health', label: 'Health insurance', d: 150, due: 1 },
    { id: 'utilities', label: 'Utilities', d: 110, due: 20 },
    { id: 'internet', label: 'Internet', d: 60, due: 12 },
    { id: 'gym', label: 'Gym', d: 30, due: 3 },
    { id: 'subs', label: 'Subscriptions (streaming, music, apps)', short: 'Subscriptions', d: 45, due: 8 }
  ];
  var VARIABLE = [
    { id: 'groceries', label: 'Groceries', d: 300 },
    { id: 'homerepair', label: 'Home repairs and upkeep', short: 'Home upkeep', d: 150 },
    { id: 'dining', label: 'Eating out / delivery', short: 'Eating out', d: 160 },
    { id: 'transport', label: 'Gas / transit', d: 120 },
    { id: 'shopping', label: 'Shopping', d: 100 },
    { id: 'fun', label: 'Going out', d: 100 },
    { id: 'gaming', label: 'Gaming', d: 40 },
    { id: 'pets', label: 'Pets', d: 60 },
    { id: 'family', label: 'Supporting family', d: 100 }
  ];
  var ANNUAL = [
    { id: 'proptaxy', label: 'Property tax (paid once or twice a year)', short: 'Property tax', d: 3500, month: 11 },
    { id: 'homeinsy', label: 'Home insurance (paid once a year)', short: 'Home insurance', d: 1400, month: 3 },
    { id: 'hoayear', label: 'HOA or association yearly dues or assessment', short: 'HOA yearly dues', d: 600, month: 1 },
    { id: 'homebig', label: 'Big home repairs (roof, heating and cooling, appliances)', short: 'Big home repairs', d: 1500, month: 6 },
    { id: 'carreg', label: 'Car registration', d: 150, month: 6 },
    { id: 'annsubs', label: 'Annual subscriptions', d: 120, month: 3 },
    { id: 'gifts', label: 'Holidays / gifts', d: 400, month: 12 },
    { id: 'travel', label: 'Travel', d: 600, month: 7 },
    { id: 'school', label: 'Textbooks / tuition', d: 500, month: 8 }
  ];
  // apr = typical rate used when the user taps "I don't know" (flagged in the UI)
  var DEBTS = [
    { id: 'student', label: 'Student loans', apr: 5.5 },
    { id: 'card', label: 'Credit card', apr: 24 },
    { id: 'bnpl', label: 'Buy Now Pay Later', apr: 0 },
    { id: 'carloan', label: 'Car loan', apr: 8 },
    { id: 'personal', label: 'Personal loan', apr: 12 },
    { id: 'heloc', label: 'Home equity loan or line (HELOC)', short: 'Home equity loan / HELOC', apr: 8.5 },
    { id: 'famdebt', label: 'Family', apr: 0 }
  ];
  var GOALS = [
    { id: 'emergency', label: 'Emergency fund', d: 1000, months: 8 },
    { id: 'deposit', label: 'Apartment deposit', d: 2000, months: 10 },
    { id: 'housedown', label: 'Down payment on a home', short: 'Home down payment', d: 20000, months: 36 },
    { id: 'homefund', label: 'Home repair fund', d: 3000, months: 18 },
    { id: 'car', label: 'Car', d: 4000, months: 18 },
    { id: 'trip', label: 'Trip', d: 1200, months: 9 },
    { id: 'moving', label: 'Moving out', d: 3000, months: 12 },
    { id: 'investing', label: 'Investing', d: 1000, months: 12 },
    { id: 'bigbuy', label: 'Big purchase', d: 1500, months: 10 }
  ];
  var PAIN = [
    { id: 'runout', label: 'I run out of money before payday' },
    { id: 'dontknow', label: "I don't know where my money goes" },
    { id: 'nocushion', label: 'I have no savings cushion' },
    { id: 'debt', label: "Debt feels like it's not shrinking" },
    { id: 'goal', label: 'I want to save for something specific' },
    { id: 'organized', label: "I'm doing OK, I just want to get organized" }
  ];
  var STYLES = [
    { id: 'track', label: 'Just track, no rules', help: 'See where it goes. No limits.' },
    { id: 'fifty', label: '50-30-20 split', help: 'Half for needs, 30% for wants, 20% for savings and debt.' },
    { id: 'zero', label: 'Every dollar assigned', help: 'Give every dollar a job until nothing is left over.' },
    { id: 'envelopes', label: 'Spending envelopes', help: 'A limit for each category. Stop when it’s empty.' },
    { id: 'pick', label: 'Pick for me', help: 'We choose based on your answers.' }
  ];
  var CHECKIN = [
    { id: 'daily', label: 'Daily' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'payday', label: 'Payday only' }
  ];
  var ADDMODE = [
    { id: 'type', label: 'Type it in' },
    { id: 'csv', label: 'Import bank CSV' },
    { id: 'both', label: 'Both' }
  ];
  var HOMEFIRST = [
    { id: 'safe', label: 'Safe-to-spend number' },
    { id: 'month', label: 'Monthly breakdown' },
    { id: 'forecast', label: 'Balance forecast' },
    { id: 'bills', label: 'Upcoming bills' },
    { id: 'goals', label: 'Goal progress' },
    { id: 'pick', label: 'Pick for me' }
  ];

  // Categories you can log a transaction against.
  var CATEGORIES = []
    .concat(BILLS.map(function (b) { return { id: b.id, name: b.short || b.label, kind: 'bill' }; }))
    .concat(VARIABLE.map(function (v) { return { id: v.id, name: v.short || v.label, kind: 'var' }; }))
    .concat([
      { id: 'other', name: 'Other', kind: 'var' },
      { id: 'billpay', name: 'Bill payment', kind: 'bill' },
      { id: 'debt', name: 'Debt payment', kind: 'debt' },
      { id: 'savings', name: 'Savings', kind: 'savings' }
    ]);
  var INCOME_CATEGORIES = [
    { id: 'pay', name: 'Paycheck' },
    { id: 'extra', name: 'Other income' }
  ];

  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function nameOf(list, id) { var f = find(list, id); return f ? (f.short || f.label || f.name) : id; }

  /* One screen per question. `kind` picks the renderer in app.js.
     The money questions (how you are paid, pay, other income, bills, everyday spending, yearly costs, debts) must be answered: enter
     amounts, or choose "None / N/A" when nothing applies. Nothing is filled in with a typical guess any more. The rest can be skipped. */
  var QUESTIONS = [
    { id: 'payFreq', section: 'Money coming in', kind: 'single', required: true, title: 'How often do you get paid?', options: PAY_FREQ },
    { id: 'pay', section: 'Money coming in', kind: 'pay', required: true, title: 'About how much per paycheck, after taxes?',
      help: 'Your best guess is fine. You can change it later. No pay right now? Choose $0 / N/A.' },
    { id: 'otherIncome', section: 'Money coming in', kind: 'rows', required: true, title: 'Any other money coming in?',
      help: 'Tap all that apply and enter a monthly amount for each (0 is fine), or choose None / N/A.',
      catalog: OTHER_INCOME, amountKey: 'monthly', amountLabel: 'Per month', noneLabel: 'None / N/A ($0)', other: true },
    { id: 'bills', section: 'Bills and spending', kind: 'rows', required: true, title: 'Which fixed bills do you have?',
      help: 'Rent or own, it’s all here: rent, mortgage, HOA dues, property tax, home insurance and more. Tap all that apply, then enter the amount and the day of the month it’s due, or choose None / N/A.',
      catalog: BILLS, amountKey: 'amount', amountLabel: 'Per month', dueKey: 'due', noneLabel: 'None / N/A ($0)', other: true },
    { id: 'variable', section: 'Bills and spending', kind: 'rows', required: true, title: 'Where does the rest of your money usually go?',
      help: 'Tap all that apply and enter a monthly amount for each (0 is fine), or choose None / N/A.',
      catalog: VARIABLE, amountKey: 'monthly', amountLabel: 'Per month', noneLabel: 'None / N/A ($0)', other: true },
    { id: 'annual', section: 'Bills and spending', kind: 'rows', required: true, title: 'Any once-or-twice-a-year costs?',
      help: 'We’ll set money aside so they don’t surprise you. Enter an amount for each (0 is fine), or choose None / N/A.',
      catalog: ANNUAL, amountKey: 'amount', amountLabel: 'Each time', monthKey: 'month', noneLabel: 'None / N/A ($0)', other: true },
    { id: 'debts', section: 'Debt', kind: 'rows', required: true, title: 'What do you owe?',
      help: 'Add what you owe, the smallest payment you must make each month, and the yearly interest rate, or choose None / N/A. A mortgage goes under fixed bills, not here.',
      catalog: DEBTS, debt: true, noneLabel: 'None / N/A', other: true },
    { id: 'pain', section: 'What you want', kind: 'multi', title: 'Which sounds most like you?',
      help: 'Pick as many as you like.', options: PAIN },
    { id: 'goals', section: 'What you want', kind: 'rows', title: 'Saving for anything?',
      help: 'Pick a goal, then a target amount and date.',
      catalog: GOALS, goal: true, noneLabel: 'Nothing right now', other: true },
    { id: 'style', section: 'How it works', kind: 'single', title: 'What budget style sounds right?',
      help: 'Not sure? Choose “Pick for me”.', options: STYLES },
    { id: 'checkin', section: 'How it works', kind: 'single', title: 'How often will you check in?', options: CHECKIN },
    { id: 'addMode', section: 'How it works', kind: 'single', title: 'How do you want to add spending?', options: ADDMODE },
    { id: 'homeFirst', section: 'How it works', kind: 'single', title: 'What should the home screen show first?', options: HOMEFIRST }
  ];

  FD.catalog = {
    PAY_FREQ: PAY_FREQ, OTHER_INCOME: OTHER_INCOME, BILLS: BILLS, VARIABLE: VARIABLE, ANNUAL: ANNUAL,
    DEBTS: DEBTS, GOALS: GOALS, PAIN: PAIN, STYLES: STYLES, CHECKIN: CHECKIN, ADDMODE: ADDMODE,
    HOMEFIRST: HOMEFIRST, CATEGORIES: CATEGORIES, INCOME_CATEGORIES: INCOME_CATEGORIES,
    QUESTIONS: QUESTIONS, find: find, nameOf: nameOf
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = FD;
})(typeof window !== 'undefined' ? window : globalThis);
