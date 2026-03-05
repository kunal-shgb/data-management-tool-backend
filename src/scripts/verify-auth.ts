import axios from 'axios';

const API_URL = 'http://localhost:3000';

async function runVerification() {
  try {
    console.log('1. Logging in as Admin...');
    const loginResponse = await axios.post(`${API_URL}/auth/login`, {
      username: 'admin',
      password: 'securepassword',
    });
    const token = loginResponse.data.access_token;
    console.log('   Login successful. Token received.');

    console.log('2. Creating a new User...');
    const createUserResponse = await axios.post(
      `${API_URL}/users`,
      {
        username: 'testuser',
        password: 'userpassword',
        role: 'user',
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    console.log('   User created:', createUserResponse.data.username);

    console.log('3. Fetching all users...');
    const usersResponse = await axios.get(`${API_URL}/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log(`   Fetched ${usersResponse.data.length} users.`);

    console.log('4. Testing unauthorized access...');
    try {
      await axios.get(`${API_URL}/users`);
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.log('   Unauthorized access correctly blocked (401).');
      } else {
        console.error(
          '   Unexpected error for unauthorized access:',
          error.message,
        );
      }
    }

    console.log('Verification completed successfully!');
  } catch (error) {
    console.error(
      'Verification failed:',
      error.response ? error.response.data : error.message,
    );
  }
}

runVerification();
