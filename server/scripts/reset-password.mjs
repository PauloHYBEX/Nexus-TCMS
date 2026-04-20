import { db } from '../db.js';
import bcrypt from 'bcryptjs';

const email = process.argv[2] || 'paulo.santos@teste';
const newPass = process.argv[3] || 'Admin@123';

const hash = await bcrypt.hash(newPass, 10);
db.prepare('UPDATE profiles SET password_hash = ?, active = 1 WHERE email = ?').run(hash, email);
const user = db.prepare('SELECT email, role, active FROM profiles WHERE email = ?').get(email);
console.log('Senha resetada com sucesso:', JSON.stringify(user));
console.log('Nova senha:', newPass);
process.exit(0);
