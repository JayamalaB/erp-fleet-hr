const request = require('supertest');

async function registerAndLogin(app, { email, companyName }) {
  await request(app)
    .post('/api/auth/register')
    .send({ name: 'Test Owner', email, password: 'password123', companyName })
    .expect(201);

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'password123' })
    .expect(200);

  const { preAuthToken, companies } = loginRes.body;
  const companyId = companies[0].companyId;

  const selectRes = await request(app)
    .post('/api/auth/select-company')
    .set('Authorization', `Bearer ${preAuthToken}`)
    .send({ companyId })
    .expect(200);

  return { accessToken: selectRes.body.accessToken, companyId };
}

function api(app, accessToken) {
  const agent = request(app);
  return {
    get: (url) => agent.get(url).set('Authorization', `Bearer ${accessToken}`),
    post: (url, body) => agent.post(url).set('Authorization', `Bearer ${accessToken}`).send(body),
    patch: (url, body) => agent.patch(url).set('Authorization', `Bearer ${accessToken}`).send(body),
  };
}

module.exports = { registerAndLogin, api };
