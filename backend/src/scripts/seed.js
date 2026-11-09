const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const { connectDb } = require("../config/db");
const env = require("../config/env");
const {
  User,
  School,
  Staff,
  Subject,
  ClassRoom,
  Student,
  Assessment,
  Mark,
  Event,
  Announcement,
  GalleryItem,
  SubscriptionPlan,
  PlatformWallet,
  PlatformAd,
  Follow,
} = require("../models");

async function upsertUser(data) {
  const existing = await User.findOne({ email: data.email });
  if (existing) return existing;
  data.passwordHash = await User.hashPassword(data.password);
  delete data.password;
  return User.create(data);
}

async function run() {
  await connectDb();
  await Promise.all([
    User.deleteMany({}),
    School.deleteMany({}),
    Staff.deleteMany({}),
    Subject.deleteMany({}),
    ClassRoom.deleteMany({}),
    Student.deleteMany({}),
    Assessment.deleteMany({}),
    Mark.deleteMany({}),
    Event.deleteMany({}),
    Announcement.deleteMany({}),
    GalleryItem.deleteMany({}),
    SubscriptionPlan.deleteMany({}),
    PlatformAd.deleteMany({}),
    Follow.deleteMany({}),
  ]);

  const admin = await upsertUser({
    fullName: "IshuriApp Super Admin",
    email: env.seedAdmin.email,
    phone: "250788000001",
    role: "super_admin",
    password: env.seedAdmin.password,
  });

  const plans = await SubscriptionPlan.insertMany([
    {
      name: "Starter",
      code: "STARTER",
      monthlyPriceRwf: 15000,
      yearlyPriceRwf: 150000,
      includedSmsCredits: 100,
      features: ["Public school website", "Staff directory", "Events & gallery", "100 SMS credits"],
      schoolTypes: ["primary", "secondary", "tvet", "university"],
    },
    {
      name: "Campus",
      code: "CAMPUS",
      monthlyPriceRwf: 35000,
      yearlyPriceRwf: 350000,
      includedSmsCredits: 500,
      features: ["Everything in Starter", "Marks & parent SMS", "Discipline office", "500 SMS credits"],
      schoolTypes: ["primary", "secondary", "tvet"],
    },
    {
      name: "University",
      code: "UNIV",
      monthlyPriceRwf: 50000,
      yearlyPriceRwf: 500000,
      includedSmsCredits: 200,
      features: ["Public campus website", "Scholarships & ceremonies", "Staff directory", "Featured listing"],
      schoolTypes: ["university"],
    },
  ]);

  const director = await upsertUser({
    fullName: "Director Mukamana",
    email: "director@gsnyarugenge.rw",
    phone: "250788111111",
    role: "school_admin",
    password: "School@123",
  });

  const school = await School.create({
    name: "GS Nyarugenge",
    slug: "gs-nyarugenge",
    type: "secondary",
    ownership: "public",
    status: "approved",
    motto: "Discipline, Knowledge, Service",
    tagline: "A leading public secondary school in Nyarugenge",
    about:
      "GS Nyarugenge is a government secondary school serving students from Kigali and nearby districts. The school offers O-Level and A-Level combinations with a strong record in sciences and languages.",
    history: "Founded to expand access to quality secondary education in Nyarugenge District.",
    vision: "To form responsible Rwandan citizens who excel academically and in character.",
    mission: "Deliver inclusive, high-quality teaching with close parent partnership.",
    coverUrl: "https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1600",
    logoUrl: "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=200",
    verified: true,
    email: "info@gsnyarugenge.rw",
    phone: "250788111000",
    whatsapp: "250788111000",
    location: {
      province: "Kigali City",
      district: "Nyarugenge",
      sector: "Nyarugenge",
      address: "KN 2 Ave, Nyarugenge, Kigali",
      latitude: -1.9706,
      longitude: 30.0588,
    },
    establishedYear: 1974,
    studentCount: 842,
    teacherCount: 48,
    nationalRank: 12,
    performanceSummary: "National exams pass rate of 94% in 2025, with strong STEM combinations.",
    examResults: [
      { year: 2025, exam: "S6 National", passRate: 94, distinctionRate: 28, notes: "Top 15 nationally" },
      { year: 2024, exam: "S6 National", passRate: 91, distinctionRate: 22 },
    ],
    facilities: ["Science labs", "Library", "Football pitch", "Computer lab", "Girls hostel"],
    programs: ["PCM", "PCB", "MCB", "HEG", "O-Level"],
    visitingHours: "Saturdays 09:00–12:00",
    smsBalance: 250,
    subscription: {
      plan: plans[1]._id,
      status: "active",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
    },
    createdBy: director._id,
    submittedAt: new Date(),
    reviewedAt: new Date(),
    reviewedBy: admin._id,
    isFeatured: true,
    followersCount: 1,
  });
  director.school = school._id;
  await director.save();

  const teacherUser = await upsertUser({
    fullName: "Jean Bosco Niyonzima",
    email: "maths@gsnyarugenge.rw",
    phone: "250788222222",
    role: "teacher",
    school: school._id,
    title: "Mathematics Teacher",
    password: "Teacher@123",
  });
  const disciplineUser = await upsertUser({
    fullName: "Claire Uwase",
    email: "discipline@gsnyarugenge.rw",
    phone: "250788333333",
    role: "discipline",
    school: school._id,
    title: "Discipline Master",
    password: "Discipline@123",
  });
  const maths = await Subject.create({ school: school._id, name: "Mathematics", code: "MATH" });
  const physics = await Subject.create({ school: school._id, name: "Physics", code: "PHY" });
  const english = await Subject.create({ school: school._id, name: "English", code: "ENG" });

  const teacherStaff = await Staff.create({
    school: school._id,
    user: teacherUser._id,
    fullName: teacherUser.fullName,
    roleTitle: "Head of Mathematics",
    category: "teacher",
    department: "Sciences",
    qualifications: "BSc Mathematics, University of Rwanda",
    bio: "12 years teaching A-Level PCM. Focus on problem solving and national exam preparation.",
    email: teacherUser.email,
    phone: teacherUser.phone,
    whatsapp: teacherUser.phone,
    socials: { linkedin: "https://linkedin.com" },
    subjects: [maths._id],
    visibility: "public",
  });
  await Staff.create({
    school: school._id,
    user: disciplineUser._id,
    fullName: disciplineUser.fullName,
    roleTitle: "Discipline Master",
    category: "discipline",
    email: disciplineUser.email,
    phone: disciplineUser.phone,
    whatsapp: disciplineUser.phone,
    visibility: "public",
  });
  await Staff.create({
    school: school._id,
    user: director._id,
    fullName: director.fullName,
    roleTitle: "Head Teacher",
    category: "leadership",
    email: director.email,
    phone: director.phone,
    whatsapp: director.phone,
    visibility: "public",
  });

  const s6pcm = await ClassRoom.create({
    school: school._id,
    name: "S6 PCM",
    level: "A-Level",
    combination: "PCM",
    academicYear: "2026",
    classTeacher: teacherStaff._id,
    subjects: [
      { subject: maths._id, teacher: teacherStaff._id },
      { subject: physics._id, teacher: teacherStaff._id },
    ],
  });

  const student = await Student.create({
    school: school._id,
    studentCode: "GSN-2026-014",
    fullName: "Aline Iradukunda",
    gender: "female",
    classRoom: s6pcm._id,
    academicYear: "2026",
    address: "Nyamirambo, Nyarugenge",
    registeredBy: teacherUser._id,
    guardians: [
      {
        relation: "father",
        fullName: "Paul Iradukunda",
        phone: "250788666666",
        address: "Nyamirambo",
        occupation: "Trader",
        isPrimary: true,
      },
      {
        relation: "mother",
        fullName: "Grace Mukeshimana",
        phone: "250788777777",
        isPrimary: false,
      },
    ],
  });

  const assessment = await Assessment.create({
    school: school._id,
    classRoom: s6pcm._id,
    subject: maths._id,
    teacher: teacherStaff._id,
    title: "Term 1 Periodic Test",
    type: "periodic",
    term: "1",
    academicYear: "2026",
    maxScore: 100,
  });
  await Mark.create({
    school: school._id,
    assessment: assessment._id,
    student: student._id,
    score: 78,
    comment: "Strong algebra, needs more practice on trigonometry.",
  });

  await Event.create({
    school: school._id,
    createdBy: director._id,
    title: "Parents meeting — Term 1",
    category: "parents_meeting",
    description: "Review of Term 1 progress and upcoming national exam timetable.",
    venue: "School hall",
    startsAt: new Date("2026-11-08T08:00:00.000Z"),
  });
  await Event.create({
    school: school._id,
    createdBy: director._id,
    title: "Inter-school debate finals",
    category: "debate",
    description: "Nyarugenge debate championship hosted on campus.",
    venue: "Main auditorium",
    startsAt: new Date("2026-10-25T12:00:00.000Z"),
  });
  await Announcement.create({
    school: school._id,
    createdBy: director._id,
    title: "Merit scholarships for S4 2027",
    type: "scholarship",
    body: "Ten full scholarships for high-performing S3 candidates from Nyarugenge. Applications close 30 November.",
  });
  await GalleryItem.create({
    school: school._id,
    imageUrl: "https://images.unsplash.com/photo-1577896851231-70ef18881754?w=1600",
    caption: "Morning assembly",
    album: "Campus life",
  });
  const uniDirector = await upsertUser({
    fullName: "Prof. Diane Uwera",
    email: "admin@ur.ac.rw",
    phone: "250788888888",
    role: "school_admin",
    password: "University@123",
  });
  const university = await School.create({
    name: "University of Rwanda — CST",
    slug: "ur-cst",
    type: "university",
    ownership: "public",
    status: "approved",
    motto: "Excellence in Science and Technology",
    tagline: "Nyarugenge campus of the University of Rwanda",
    about:
      "The College of Science and Technology trains engineers, computer scientists and applied researchers serving Rwanda's development agenda.",
    coverUrl: "https://images.unsplash.com/photo-1562774053-701939374585?w=1600",
    verified: true,
    email: "cst@ur.ac.rw",
    phone: "250788000100",
    location: {
      province: "Kigali City",
      district: "Nyarugenge",
      sector: "Nyarugenge",
      address: "KN 7 Ave, Kigali",
      latitude: -1.958,
      longitude: 30.064,
    },
    establishedYear: 1963,
    studentCount: 6200,
    nationalRank: 1,
    programs: ["Computer Science", "Civil Engineering", "Architecture", "Information Systems"],
    smsBalance: 80,
    subscription: {
      plan: plans[2]._id,
      status: "active",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
    },
    createdBy: uniDirector._id,
    isFeatured: true,
  });
  uniDirector.school = university._id;
  await uniDirector.save();
  await Event.create({
    school: university._id,
    title: "Graduation ceremony 2026",
    category: "graduation",
    description: "Undergraduate and postgraduate conferment at CST.",
    venue: "Kigali Convention Centre",
    startsAt: new Date("2026-12-12T07:00:00.000Z"),
  });
  await Announcement.create({
    school: university._id,
    title: "Mastercard Foundation scholarships",
    type: "scholarship",
    body: "Applications open for STEM undergraduate scholarships for Rwandan students from low-income households.",
  });

  await School.create({
    name: "Lycee de Kigali",
    slug: "lycee-de-kigali",
    type: "secondary",
    ownership: "public",
    status: "pending_review",
    about: "Historic public lycee applying to join IshuriApp.",
    location: { province: "Kigali City", district: "Nyarugenge", sector: "Nyamirambo" },
    submittedAt: new Date(),
  });

  await PlatformAd.insertMany([
    {
      title: "Kigali tech internships — Summer 2027",
      body: "ICT chamber partners are recruiting S6 and university students for 8-week internships.",
      category: "internship",
      ctaLabel: "Apply now",
      imageUrl: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=1200",
      createdBy: admin._id,
    },
    {
      title: "Campus life in 30 seconds",
      body: "See what a verified IshuriApp school looks like — then open the campus website inside IshuriApp.",
      category: "event",
      ctaLabel: "Watch & explore",
      imageUrl: "https://images.unsplash.com/photo-1523580846011-d3a5bc25702b?w=1200",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
      createdBy: admin._id,
    },
    {
      title: "New school on IshuriApp: GS Nyarugenge",
      body: "Explore staff, rankings, events and visiting days.",
      category: "new_school",
      school: school._id,
      ctaLabel: "Open profile",
      imageUrl: "https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1200",
      createdBy: admin._id,
    },
  ]);

  const wallet = await PlatformWallet.getSmsWallet();
  wallet.wholesaleCredits = 5000;
  wallet.totalBought = 5000;
  wallet.totalSoldToSchools = 330;
  await wallet.save();

  console.log("Seed complete");
  console.log("Super admin:", env.seedAdmin.email, env.seedAdmin.password);
  console.log("School admin: director@gsnyarugenge.rw / School@123");
  console.log("Teacher: maths@gsnyarugenge.rw / Teacher@123");
  console.log("Discipline: discipline@gsnyarugenge.rw / Discipline@123");
  console.log("University admin: admin@ur.ac.rw / University@123");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
