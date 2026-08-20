require("dotenv").config();

const express = require("express");
const bcrypt = require("bcrypt");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const app = express();

const db = require("./db");

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "jwt";


const allowedOrigins = [
    "https://my-village-zeta.vercel.app",
    "http://localhost:5173",
];


const corsOptions = {

    origin: function (origin, callback) {

        if (
            !origin ||
            allowedOrigins.includes(origin)
        ) {
            return callback(null, true);
        }

        console.log(
            "Blocked CORS origin:",
            origin
        );

        return callback(
            new Error("Not allowed by CORS")
        );
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

app.use(express.json());



const initializeDatabaseAndServer = async () => {
    await db.connect();
    try{
        app.listen(PORT,"0.0.0.0", () => {
            console.log(`Server is running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Error starting the server:", error.message);
    }
}

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
    jwt.verify(jwtToken, JWT_SECRET, async (error, payload) => {
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
            const token = jwt.sign(payload, JWT_SECRET);
            res.status(200).json({token, name: user.name, userId: user.user_id,role: user.role,phone: user.phone_number,email: user.email});
        } else {
            res.status(400).send("Invalid Password");
        }
    }
})

app.get('/discussions', authenticateToken, async (req, res) => {
    const selectQuery = `SELECT d.*, u.name,u.role,u.profile_picture_url FROM discussions d inner join users u on d.user_id = u.user_id order by d.created_at desc`;
    const dbDiscussions = await db.query(selectQuery);
    res.status(200).json(dbDiscussions.rows);
})

app.post('/discussions', authenticateToken, async (req, res) => {
        const { title, content, category, userId, imageUrl } = req.body;

        const insertQuery = `
            INSERT INTO discussions
            (title, content, category, user_id, image_url)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;

        await db.query(insertQuery, [
            title,
            content,
            category,
            userId,
            imageUrl
        ]);

        res.status(201).json({
            message: "Discussion created successfully"
        });
});

app.get('/issues', authenticateToken, async (req, res) => {
    const selectQuery = `SELECT i.*, u.name,u.profile_picture_url FROM issues i inner join users u on i.user_id = u.user_id order by i.created_at desc`;
    const dbIssues = await db.query(selectQuery);
    res.status(200).json(dbIssues.rows);
})

app.post('/issues', authenticateToken, async (req, res) => {
    const { title, description, category, location, userId, image } = req.body;
    const result = await db.query(
        `INSERT INTO issues (title, description, category, location, user_id, image_url, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [title, description, category, location, userId, image]
    );
    res.status(201).json({
        message: "Issue created successfully",
        issue: result.rows[0]
    });
})


app.put('/issues/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const updateQuery = `
        UPDATE issues
        SET status = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
    `;
    const result = await db.query(updateQuery, [status, id]);
    res.status(200).json({
        message: "Issue updated successfully",
        issue: result.rows[0]
    });
})

app.put('/users/:userId/profile-picture', authenticateToken, async (req, res) => {
    const { userId } = req.params;
    const { profile_picture_url } = req.body;
    const updateQuery = `
        UPDATE users
        SET profile_picture_url = $1
        WHERE user_id = $2
        RETURNING *
    `;
    const result = await db.query(updateQuery, [profile_picture_url, userId]);
    res.status(200).json({
        message: "Profile picture updated successfully",
        user: result.rows[0]
    });
})