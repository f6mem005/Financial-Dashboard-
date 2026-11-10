/* questions.js - the survey content. Edit wording here; the app builds every screen from this list. */
(function (root) {
  'use strict';
  var SV = (root.SV = root.SV || {});

  var FEATURES = [
    { id: 'safe', label: 'A "safe to spend" number', desc: 'how much I can spend before my next paycheck' },
    { id: 'where', label: 'Where my money went', desc: 'this month, shown as a simple chart by category' },
    { id: 'leaks', label: 'My top 3 "leaks"', desc: 'the things I overspend on most' },
    { id: 'bills', label: 'Upcoming bills', desc: 'with which ones are already paid' },
    { id: 'forecast', label: 'A forecast of my balance', desc: 'over the next 1, 3, 6 or 12 months' },
    { id: 'whatif', label: '"What if" sliders', desc: 'for example "what if I cut eating out by $50 a month?"' },
    { id: 'alerts', label: 'Alerts', desc: "a bill is due soon, I'm overspending, or my balance will go below zero" },
    { id: 'goals', label: 'Progress toward a savings goal', desc: 'am I on track?' },
    { id: 'debt', label: 'A plan to pay off debt faster', desc: '' },
    { id: 'subs', label: 'A list of my subscriptions', desc: 'and what they cost per year' },
    { id: 'yearly', label: 'Help planning for once-a-year costs', desc: 'car registration, gifts, travel' },
    { id: 'lowmonth', label: 'A safe "low month" estimate', desc: 'if my income varies, to plan around' },
    { id: 'terms', label: 'Plain-language explanations', desc: 'of money terms' },
    { id: 'shared', label: 'A shared view with a partner or roommate', desc: 'for example splitting bills' },
    { id: 'invest', label: 'Learning material about investing', desc: 'general education only, no specific recommendations' }
  ];

  var P1 = 'What would you want to see?', P2 = 'How you would use it', P3 = 'Style and habits', P4 = 'In your own words', P5 = 'Stay in touch', PT = 'A look at the dashboard';

  var QUESTIONS = [
    { id: 'q1', part: P1, type: 'grid', required: true, shuffle: true, items: FEATURES, scale: 5, scaleLow: 'Not important', scaleHigh: 'Essential', unsure: true,
      title: 'Imagine opening a money dashboard. How important is each of these to you?',
      help: 'Tap a number for each row. Tap the same number again to clear it.' },
    { id: 'q2', part: P1, type: 'pick', required: true, shuffle: true, exact: 3, items: FEATURES,
      title: 'If the top of the home screen could show only THREE of these, which three?',
      help: 'Tap to choose. Tap a chosen one again to unchoose it.' },
    { id: 'q3', part: P1, type: 'rank', required: true, from: 'q2',
      title: 'Put your three in order',
      help: 'Drag the handle, or use the arrows. Number 1 is the most important, at the very top.' },
    { id: 'q4', part: P1, type: 'single', required: false, shuffle: true,
      items: FEATURES.concat([{ id: 'all', label: "I'd use all of them", desc: '', fixedLast: true }]),
      title: 'Which ONE of these would you probably never use?', help: 'Optional.' },

    { id: 'q11', part: P1, type: 'multi', required: false, exclusive: [], otherText: true,
      title: 'What would make you stop using a budgeting app?', help: 'Choose all that apply.',
      items: [{ id: 'typing', label: 'Too much typing' }, { id: 'judged', label: 'It makes me feel judged' }, { id: 'complex', label: "It's too complicated" },
        { id: 'upsell', label: 'Constant upsells or ads' }, { id: 'reallife', label: "It doesn't match my real life" }, { id: 'forget', label: "I'd just forget about it" },
        { id: 'other', label: 'Something else' }] },
    { id: 'q12', part: P1, type: 'text', required: true, max: 2000,
      title: 'What is the ONE thing you wish a money dashboard would just tell you?', help: 'A sentence or two is plenty.' },
    { id: 'q13', part: P1, type: 'text', required: false, max: 2000,
      title: 'Looking back at the list of features: is anything missing? Any ideas for features we did not mention?',
      help: 'Optional. Write as much or as little as you like.' },

    { id: 'q5', part: P2, type: 'single', required: false,
      title: 'Realistically, how often would you check it?',
      items: [{ id: 'daily', label: 'Every day' }, { id: 'few', label: 'A few times a week' }, { id: 'weekly', label: 'About once a week' },
        { id: 'payday', label: 'Around payday only' }, { id: 'trouble', label: 'Only when something feels wrong' }] },
    { id: 'q6', part: P2, type: 'single', required: false,
      title: 'Which device would you use most?',
      items: [{ id: 'phone', label: 'My phone' }, { id: 'computer', label: 'A computer or laptop' }, { id: 'both', label: 'Both about equally' }] },
    { id: 'q7', part: P2, type: 'multi', required: true, exclusive: ['unsure'],
      title: 'How would you want your spending to get into it?', help: 'Choose all that apply.',
      items: [{ id: 'type', label: 'Type it in myself' }, { id: 'file', label: 'Upload a file I download from my bank' },
        { id: 'photo', label: 'Take photos of receipts' }, { id: 'unsure', label: 'Not sure' }] },

    { id: 'q8', part: P3, type: 'single', required: false,
      title: 'Which feels best to you?',
      items: [{ id: 'simple', label: 'Very simple: only a few numbers' }, { id: 'tap', label: 'Simple, with more detail when I tap for it' },
        { id: 'lots', label: 'Everything in one place with lots of detail' }] },
    { id: 'q9', part: P3, type: 'single', required: false,
      title: "Which budgeting approach sounds most like what you'd want?",
      items: [{ id: 'track', label: 'Just track my spending, no rules' },
        { id: 'split', label: 'A simple split: about half for needs, 30% for wants, 20% for savings and debt' },
        { id: 'zero', label: 'Give every dollar a job until nothing is left over' },
        { id: 'envelopes', label: 'A spending limit for each category, like envelopes' },
        { id: 'pick', label: "I'm not sure. Pick something for me" }] },
    { id: 'q10', part: P3, type: 'multi', required: false, exclusive: ['none'],
      title: 'If reminders were available, which ones would you like?', help: 'Choose all that apply. They are not available yet; your answers help us decide which to build.',
      items: [{ id: 'bill', label: 'A reminder when a bill is due' }, { id: 'weekly', label: 'A weekly summary' }, { id: 'payday', label: 'A check-in on payday' },
        { id: 'over', label: "A warning when I'm overspending" }, { id: 'none', label: 'No reminders' }] },

    { id: 'q14', part: P4, type: 'text', required: false, max: 2000,
      title: 'Have you used a money or budgeting app you loved or hated? What made it good or bad?', help: 'Optional.' },
    // The example screens (a guided tour: pictures with example numbers, nothing real). It holds no answer and does not count as a question.
    { id: 'demo', part: PT, type: 'tour', required: false,
      title: 'Here is what the dashboard looks like',
      help: 'These are example screens with made-up numbers. Page through them, then tell us what you think on the next two screens.' },
    { id: 'q17', part: P4, type: 'text', required: false, max: 2000,
      title: 'Is there anything you do not like about what you just saw?',
      help: 'Optional. Be as blunt as you like: the layout, a number, a word, anything.' },
    { id: 'q18', part: P4, type: 'text', required: false, max: 2000,
      title: 'Is there anything you would like to see that is not there?',
      help: 'Optional. A feature, a screen, or something you do with your money that this does not cover.' },
    { id: 'q16', part: P4, type: 'text', required: false, max: 2000,
      title: "Anything else you'd like to tell us?",
      help: 'Optional. About the app, this survey, or anything we did not ask.' },

    { id: 'q15', part: P5, type: 'contact', required: false,
      title: 'Would you be willing to try an early version and give feedback?',
      help: 'Optional. Your email is used only to contact you about this, and is never shared.' }
  ];

  /* The example screens for the tour. k: label | big | note | row (a, b, c) | bar (pct) | spark (d). All numbers are made up. */
  SV.tour = [
    { id: 'home', title: 'Home', caption: 'What is safe to spend until payday, and which bills are coming.',
      screen: [{ k: 'label', t: 'Safe to spend until payday' }, { k: 'big', t: '$412' }, { k: 'bar', pct: 62 }, { k: 'note', t: '6 days to go. Bills already set aside.' },
        { k: 'label', t: 'Coming up' }, { k: 'row', a: 'Rent', b: 'Fri', c: '$900' }, { k: 'row', a: 'Phone', b: 'Mon', c: '$45' }, { k: 'row', a: 'Streaming', b: 'Wed', c: '$12' }] },
    { id: 'forecast', title: 'Forecast', caption: 'Where your balance is heading, and when it could run low.',
      screen: [{ k: 'label', t: 'Your balance over the next 3 months' }, { k: 'spark', d: 'M0 14 L25 18 L50 12 L75 30 L100 36 L125 28 L150 20 L175 16 L200 10' },
        { k: 'note', t: 'Heads up: it dips below your $200 minimum around Dec 14.' }, { k: 'label', t: 'What if' }, { k: 'row', a: 'Cut eating out by $50 a month', b: '', c: '+$150' }] },
    { id: 'plan', title: 'Plan', caption: 'Your bills, your spending limits and your debt in one place.',
      screen: [{ k: 'label', t: 'Fixed bills' }, { k: 'row', a: 'Rent', b: '', c: '$900' }, { k: 'row', a: 'Phone', b: '', c: '$45' }, { k: 'row', a: 'Internet', b: '', c: '$60' },
        { k: 'label', t: 'Left over this month' }, { k: 'big', t: '$380' }, { k: 'note', t: 'After bills, spending and your debt payment.' }] },
    { id: 'ideas', title: 'Ideas', caption: 'How much you could set aside, and what saving it could grow into. General education only, not advice.',
      screen: [{ k: 'label', t: 'You could set aside about' }, { k: 'big', t: '$140 a month' }, { k: 'row', a: 'First, a cushion', b: '', c: '$1,000' }, { k: 'row', a: 'Then, something for later', b: '', c: '' },
        { k: 'note', t: 'Illustration: $140 a month for 10 years could grow to roughly $17,000 to $24,000. An example, not a promise.' }] },
    { id: 'spend', title: 'Ideas: spend less', caption: 'Places to cut back, and charges that look doubled up.',
      screen: [{ k: 'label', t: 'Subscriptions cost' }, { k: 'big', t: '$1,020 a year' }, { k: 'note', t: 'About $85 a month. Worth a look for ones you rarely use.' },
        { k: 'label', t: 'These look like the same bill' }, { k: 'row', a: 'Streaming', b: 'Nov 3', c: '$12' }, { k: 'row', a: 'Streaming', b: 'Nov 4', c: '$12' }] }
  ];

  var QUESTION_COUNT = QUESTIONS.filter(function (q) { return q.type !== 'tour'; }).length;   // the example screens are not questions
  SV.questions = QUESTIONS;
  SV.features = FEATURES;
  /* the banner shown above every screen, and who the survey came from (shown on the first screen) */
  SV.brand = { name: 'Finance Sense', tag: 'Questionnaire', sentLabel: 'Sent to you by', sentBy: 'Manny M' };
  SV.intro = {
    title: 'Help design an easy-to-understand money dashboard',
    lead: "We're building a tool to help you see your money clearly, without needing to be a budgeting expert. Before we build more, we want to hear what you would actually use.",
    points: [
      'There are ' + QUESTION_COUNT + ' questions.',
      'There are no right or wrong answers. Honest answers, including "I would not use that," help us most.',
      'We will not ask for bank details, account numbers, or how much you earn or spend.',
      'Your answers are anonymous. If you choose to leave an email at the very end, it is kept separately from your answers.',
      "We're not selling anything. Answers are only used to decide what to build."
    ]
  };
  SV.thanks = {
    title: 'Thank you',
    body: 'Your answers will directly shape what gets built. If you left an email, we will reach out only about trying the early version.'
  };
})(typeof window !== 'undefined' ? window : globalThis);
