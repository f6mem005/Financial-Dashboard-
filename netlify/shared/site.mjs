// The words on the sign-in page, and the id that ties the session cookie to this site. Nothing secret belongs here.
export const SITE = {
  id: "finance-sense-app",   // binds the session cookie to THIS site: a cookie from another site (even with the same secrets) is refused
  title: "Finance Sense",
  tag: "Your money, made simple",
  heading: "Sign in to continue",
  blurb: "Enter the name and passcode you were given to open Finance Sense.",
  nameLabel: "Your name",
  nameHint: "Admin? Leave this blank."
};
