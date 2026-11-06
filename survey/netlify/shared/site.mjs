// The words on the sign-in page, and the id that ties the session cookie to this site. Nothing secret belongs here.
export const SITE = {
  id: "finance-sense-survey",   // binds the session cookie to THIS site: a cookie from another site (even with the same secrets) is refused
  title: "Finance Sense",
  tag: "Questionnaire",
  heading: "Enter your name and passcode to begin",
  blurb: "Sent to you by Manny M. Enter the name and passcode that came with your invitation to open the questionnaire.",
  nameLabel: "Your name",
  nameHint: "Use the name from your invitation. Admins: leave this blank."
};
