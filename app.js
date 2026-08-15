require("dotenv").config();

const express = require("express");
const bcrypt = require("bcrypt");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const app = express();
const db = require("./db");

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error("JWT_SECRET is missing");
    process.exit(1);
}
const allowedOrigins = [
    "https://my-village-zeta.vercel.app"
];

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin) {
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        console.log("Blocked CORS origin:", origin);
        return callback(new Error("Not allowed by CORS"));
    },

    methods: [
        "GET",
        "POST",
        "PUT",
        "DELETE",
        "OPTIONS"
    ],

    allowedHeaders: [
        "Content-Type",
        "Authorization"
    ],

    credentials: true
};


app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json());


const initializeDatabaseAndServer = async () => {
    try {
        await db.query("SELECT 1");

        console.log("Database connected successfully");

        app.listen(PORT, "0.0.0.0", () => {
            console.log(`Server is running on port ${PORT}`);
        });

    } catch (error) {
        console.error("Database connection failed:");
        console.error(error);

        process.exit(1);
    }
};

initializeDatabaseAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, process.env.JWT_SECRET, async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.get("/", (req, res) => {
    res.send("MyVillage Backend Running Successfully");
});

app.post('/register', async (req, res) => {
    const {email, password, name, phoneNumber, village} = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const selectQuery = `SELECT * FROM users WHERE email = $1`;
    const dbUser = await db.query(selectQuery, [email]);
    if(dbUser.rows.length === 0){
        const insertQuery = `INSERT INTO users (email, password, name, phone_number, village) VALUES ($1, $2, $3, $4, $5)`;
        await db.query(insertQuery, [email, hashedPassword, name, phoneNumber, village]);
        res.status(200).send("User created successfully");
    } else {
        res.status(400).send("User already exists");
    }
})

app.post('/login', async (req, res) => {
    const {email, password} = req.body;
    const selectQuery = `SELECT * FROM users WHERE email = $1`;
    const dbUser = await db.query(selectQuery, [email]);
    if(dbUser.rows.length === 0){
        res.status(400).send("Invalid Email");
    } else {
        const user = dbUser.rows[0];
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if(isPasswordValid){
            const payload = { email: user.email};
            const token = jwt.sign(payload, process.env.JWT_SECRET);
            res.status(200).json({token, name: user.name, userId: user.user_id,role: user.role});
        } else {
            res.status(400).send("Invalid Password");
        }
    }
})

app.get('/discussions', authenticateToken, async (req, res) => {
    const selectQuery = `SELECT d.*, u.name,u.role FROM discussions d inner join users u on d.user_id = u.user_id order by d.created_at desc`;
    const dbDiscussions = await db.query(selectQuery);
    res.status(200).json(dbDiscussions.rows);
})

app.post('/discussions', authenticateToken, async (req, res) => {
        const { title, content, category, userId } = req.body;

        const insertQuery = `
            INSERT INTO discussions
            (title, content, category, user_id)
            VALUES ($1, $2, $3, $4)
        `;

        await db.query(insertQuery, [
            title,
            content,
            category,
            userId
        ]);

        res.status(201).json({
            message: "Discussion created successfully"
        });
});

app.get('/issues', authenticateToken, async (req, res) => {
    const selectQuery = `SELECT i.*, u.name FROM issues i inner join users u on i.user_id = u.user_id order by i.created_at desc`;
    const dbIssues = await db.query(selectQuery);
    console.log(dbIssues.rows);
    res.status(200).json(dbIssues.rows);
})

app.post('/issues', authenticateToken, async (req, res) => {
    const { title, description, category, location, userId, image } = req.body;
    console.log(req.body);
    await db.query(
        `INSERT INTO issues (title, description, category, location, user_id, image_url, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [title, description, category, location, userId, image]
    )
    res.status(201).json({
        message: "Issue created successfully"
    });
})