require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/user");

async function main() {
  const username = process.argv[2];
  if (!username) {
    console.error("Usage: node createAdmin.js <username>");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const user = await User.findOneAndUpdate(
    { username },
    { role: "admin" },
    { new: true }
  );

  if (!user) {
    console.error(`No user found with username "${username}". Register the account first, then run this script.`);
  } else {
    console.log(`✅ ${user.username} is now an admin.`);
  }

  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});