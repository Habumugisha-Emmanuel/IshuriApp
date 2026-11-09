const fs = require("fs");
const path = require("path");

const files = [
  "src/App.jsx",
  "src/workspace.jsx",
  "src/liveChat.jsx",
  "src/messageAnalytics.jsx",
  "src/messageWallet.jsx",
  "src/earningsDashboard.jsx",
  "src/officialReport.jsx",
  "src/notice.js",
];
const keys = new Set();
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const re = /t\("((?:\\.|[^"\\])*)"\)/g;
  let match;
  while ((match = re.exec(source))) keys.add(match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
}

const extras = `
Discover
Rankings
Events
Now
All
Primary
Secondary
TVET
University
Home
About
Staff
Gallery
Contact
Parents meeting
Sport
Competition
Debate
Ceremony
Visiting day
Graduation
Scholarship
Event
Overview
Schools
Platform
School
People
School life
My class
Discipline
Messages
Classes
Assessments
Week
Month
Year
pending review
approved
draft
rejected
suspended
primary
secondary
tvet
university
Hide
Show
Error
Warning
Alert
Success
Sound on
Tap for sound
You're caught up
{count} new
Replying to yourself
Replying to {name}
Save
Send
Remove {name} from this class list?
Remove {name}? They will no longer be able to sign in.
Remove {name}? It will leave the class list. Students already registered stay on their records.
Delete {name}? The saved marks will be removed too.
Delete {name}? This cannot be undone.
Delete “{name}”?
January
February
March
April
May
June
July
August
September
October
November
December
Today
This week
All messages
Paid
Unpaid
Marks
Term results
School notice
Up
Down
vs previous
From
To
Your messages
School messages
Total revenue
Successful messages
Today's earnings
Average daily earnings
Total expenses
Net profit
Daily
Weekly
Monthly
Quarterly
Yearly
Term
Page
of
IshuriApp · Official report
Official academic record
Official conduct record
Official report
Class teacher
School administration
Parent / guardian
Revenue is each successfully delivered message × 5 RWF. Unpaid and unsent messages are excluded. Net profit subtracts SMS gateway purchases and recorded operating costs in this period.
Sent to {count} parent.
Sent to {count} parents.
Message Wallet: {count} message left.
Message Wallet: {count} messages left.
{label} must begin with 250, for example 250788000000.
{subject} is not a subject of {class}.
{count} online
Sent {count}. Not sent: {details}
Category must be one of: {list}
Offline
Active
Activate
Suspend
Visible
Hidden until approved
Admin verified
Unverified
Teacher
Director
Leadership
Support
Discipline officer
video
image
hour
day
month
Done.
Something went wrong
The request did not complete
That message is missing
You are not in this conversation
Messages are for school directors and IshuriApp
Choose a person to message
Choose someone else
That person is not available
You can message school directors and IshuriApp
Write a message
Keep the message under 2000 characters
Choose a message to reply to
That message is no longer in this chat
Choose a reaction
That message was unsent
You can edit only your own message
A heart cannot be edited
Write the message
You can unsend only your own message
Enter the cost in Rwandan francs.
Enter the date of this cost.
That cost was not found.
Enter how many messages are left, using a whole number.
School not found
Name, email and password are required
An account with this email already exists
Phone must begin with 250, for example 250788000000.
Invalid email or password
This account is disabled
Class not found
Add the subjects to this class before creating an assessment
Choose a subject that belongs to this class
Enter the assessment title
Set the mark the assessment is over, for example 100
Choose a class in this school
Set the assessment date as year-month-day, for example 2026-10-16
Universities do not record class marks
This account has no staff profile for assessments
Assessment not found
Record marks before notifying parents
Choose the academic year and the term.
Student not found
Choose a class or a student.
Marks ranges must be numbers
Set ranges from highest to lowest: maximum, normal, medium, then abnormal
Enter how many marks to subtract
Initialize the term discipline marks first
Case not found
No parent phone on this student
You can only manage students in a class assigned to you
Universities do not register class students here
Student name and code are required
Choose a class before registering the student
Enter the parent phone. That number receives the messages.
Class does not belong to this school
You can only register students in a class assigned to you
The parent phone must begin with 250, for example 250727022525.
Add a guardian first
Parent email and password are required
Universities do not use the marks and class register in IshuriApp
Credits must be greater than 0
Platform wholesale SMS stock is insufficient
School must be approved before buying SMS
Select a school.
Enter the total number of messages this payment allows.
Enter the amount paid, in Rwandan francs.
Enter the date the school paid.
That payment was not found.
This correction removes more messages than the wallet has left.
Those messages have already been used, so this payment cannot move to another school.
Your Message Wallet is empty. Top up the Message Wallet before sending more messages.
Name and role title are required
Accountant accounts are not part of IshuriApp
Email already in use
Staff not found
Not allowed
School must be approved first
This school is already in review or live
This account already has a school profile
School name and type are required
Write the message first
No valid phone numbers. Every number must begin with 250, for example 250788000000
The SMS service could not be reached
The SMS service did not send this message
Cloudinary is not configured on the server
Choose a photo or short video
Cloudinary is not configured
No file received
Title is required
Ad not found
Following schools is not available. Browse public school profiles without an account.
Following schools is not available
Stock item not found
Quantity must be greater than 0
Not enough stock on hand
Plan or school not found
Event not found
Authentication required
Account is inactive or missing
Director details and school name/type are required
Validation failed
A record with those unique fields already exists
Internal server error
Language
Week
Day
Hour
Seen
Sent
Pending
You
Today
Yesterday
Deleted
Ad activated
Ad suspended
Edit ad
Publish home ad
Update student
Register student
New password
Password
Leave blank to keep the current password
Update staff
New account
Register and assign teacher
Register staff member
Update class
Add class
Edit assessment
New assessment
Create assessment
Selected
Open marks
Create your school
School website
Submitted
Saved
Submit for approval
Save website profile
Campus
Date to be set
No limit yet
Left after
Amount
Record a school payment
Correct this payment
Save correction
Record payment
Cost recorded
Net profit now includes it.
Cost removed
It is no longer in this period.
No delivered messages
delivered today
Gateway
Operating
Application was returned
Search school
rows of schools
`.trim().split(/\n/).map((item) => item.trim()).filter(Boolean);
extras.forEach((item) => keys.add(item));

const root = path.resolve("..", "backend", "src");
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (name.endsWith(".js")) {
      const source = fs.readFileSync(full, "utf8");
      const re = /new ApiError\(\s*\d+\s*,\s*"([^"]+)"/g;
      let match;
      while ((match = re.exec(source))) keys.add(match[1]);
    }
  }
}
walk(root);
const list = [...keys].filter((item) => item && !["wallet-alert span", "wallet-note span", ",", "-", "/"].includes(item)).sort();
fs.writeFileSync("tmp-final-keys.txt", list.join("\n"));
console.log(list.length);
process.exit(0);
