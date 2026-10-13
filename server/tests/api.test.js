const assert = require('assert');
const { app } = require('../src/server');

async function testApi() {
  console.log('\n[API-Test] Verifying HTTP endpoints...');
  const server = app.listen(5099);

  try {
    const studentDefaultPassword = process.env.SEED_STUDENT_PASSWORD || 'Student@Pass123';
    const adminDefaultPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin@SecurePass123';

    // 1. Health check
    const healthRes = await fetch('http://localhost:5099/api/health');
    const healthData = await healthRes.json();
    assert.strictEqual(healthData.status, 'HEALTHY');
    assert.strictEqual(healthData.tagline, 'Every Request. Every Seat. Under Control.');
    console.log('  ✅ Health check passed. Tagline verified.');

    // 2. Student login (VANSHIKA 620)
    const loginRes = await fetch('http://localhost:5099/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: '620', password: studentDefaultPassword }),
    });
    const loginData = await loginRes.json();
    assert.strictEqual(loginRes.status, 200, 'Student login must succeed');
    assert.strictEqual(loginData.user.studentId, '620');
    assert.strictEqual(loginData.user.name, 'VANSHIKA');
    const studentToken = loginData.token;
    console.log('  ✅ Student login passed for VANSHIKA (620).');

    // 3. Admin login
    const adminLoginRes = await fetch('http://localhost:5099/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: 'admin@raceguardx.edu', password: adminDefaultPassword }),
    });
    const adminData = await adminLoginRes.json();
    assert.strictEqual(adminLoginRes.status, 200, 'Admin login must succeed');
    assert.strictEqual(adminData.user.role, 'ADMIN');
    const adminToken = adminData.token;
    console.log('  ✅ Admin login passed for System Administrator.');

    // 4. Fetch courses as student
    const coursesRes = await fetch('http://localhost:5099/api/courses', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const coursesData = await coursesRes.json();
    assert.ok(Array.isArray(coursesData.courses), 'Courses array returned');
    assert.ok(coursesData.courses.length >= 3, 'Initial seeded courses exist');
    console.log(`  ✅ Courses fetched (${coursesData.courses.length} courses found).`);

    // 5. Admin overview
    const overviewRes = await fetch('http://localhost:5099/api/admin/overview', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const overviewData = await overviewRes.json();
    assert.ok(Array.isArray(overviewData.courses), 'Admin courses list exists');
    assert.ok(Array.isArray(overviewData.auditLogs), 'Admin audit log exists');
    console.log('  ✅ Admin overview passed.');

    console.log('\n🎉 ALL API TESTS PASSED SUCCESSFULLY!\n');
    server.close();
    process.exit(0);
  } catch (err) {
    server.close();
    console.error('❌ API Test Failed:', err.message);
    process.exit(1);
  }
}

testApi();
