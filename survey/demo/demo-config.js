/* Switches the app's own code into demo-only mode (see js/app.js): sample data only, no Settings, nothing saved, and a pinned bar that leads back
   to the questions. continueUrl is a path on this site; the survey reads ?demo=done and starts at the first question. */
window.FD_DEMO_ONLY = {
  continueUrl: '/?demo=done',
  continueLabel: 'Continue to the questions',
  note: 'This is a demo with made-up numbers. Look around, then continue to the questions.'
};
