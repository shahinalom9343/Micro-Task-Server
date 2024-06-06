const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;

// middlewares
app.use(cors());
app.use(express.json());

// mongodb codes
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.43teffq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    // collections
    const userCollection = client.db("picoTaskDB").collection("users");
    const taskCollection = client.db("picoTaskDB").collection("tasks");
    const submissionCollection = client.db("picoTaskDB").collection("submission");
    const paymentCollection = client.db("picoTaskDB").collection("payments");


    // jwt related API
    app.post("/jwt", async(req,res)=>{
      const user = req.body;
      const token = jwt.sign(user,process.env.ACCESS_TOKEN_SECRET,{
        expiresIn:"1h"});
      res.send({token})
    })

    // middlewares
    const verifyToken = (req,res,next)=>{
      //  console.log("inside verifytoken",req.headers.authorization);
       if(!req.headers.authorization){
        return res.status(401).send({message:"Unauthorized Access"});
       }
       const token = req.headers.authorization.split(" ")[1];
       jwt.verify(token,process.env.ACCESS_TOKEN_SECRET,(err,decoded)=>{
        if(err){
          return res.status(400).send({message:"Invalid token"});
        }
        req.decoded = decoded;
        next();
       })
    }

    // check if user is admin or not
    const verifyAdmin = async(req,res,next)=>{
      const email = req.decoded.email;
      const query = {email:email};
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role ==="admin";
      if(!isAdmin){
        return res.status(403).send({message:"Forbidden Admin Access"});
      }
      next();
    }
    // check if user is creator or not
    const verifyCreator = async(req,res,next)=>{
      const email = req.decoded.email;
      const query = {email:email};
      const user = await userCollection.findOne(query);
      const isCreator = user?.role ==="taskCreator";
      if(!isCreator){
        return res.status(403).send({message:"Forbidden Creator Access"});
      }
      next();
    }

    // task related api
    // get all submitted tasks
      app.get("/submission", async(req,res)=>{
      const result = await submissionCollection.find().toArray();
      res.send(result);
    })
     // get all tasks
      app.get("/tasks", async(req,res)=>{
      const result = await taskCollection.find().toArray();
      res.send(result);
    })
     // delete task
    app.delete("/tasks/:id", verifyToken,verifyAdmin, async(req,res)=>{
      const id =req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await taskCollection.deleteOne(query);
      res.send(result);
    })
    app.post("/submission", async(req,res)=>{
      const submittedTask = req.body;
      const result = await submissionCollection.insertOne(submittedTask);
      res.send(result);
    })
    app.post("/tasks",verifyToken, async(req,res)=>{
      const task = req.body;
      const result = await taskCollection.insertOne(task);
      res.send(result);
    })
    // get specific task for submission
    app.get("/tasks/:id", async(req,res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await taskCollection.findOne(query);
      res.send(result);
    })
    // update task information
    app.put("/tasks/:id", verifyToken,verifyCreator, async(req,res)=>{
      const id = req.params.id;
      const filter = {_id: new ObjectId(id)};
      const options = {upsert : true};
      const updatedInfo = req.body;
      const updated = {
        $set:{
           title : updatedInfo.title,
           quantity: updatedInfo.quantity,
           details: updatedInfo.details,
        }
      }
      const result = await taskCollection.updateOne(filter,updated,options);
      res.send(result);
      
    })


    // create payment intent
    app.post('/create-payment-intent', verifyToken, async (req, res) => {
      const {price} = req.body;
      const amount = parseFloat(price*100);
      if (!price || amount < 1) return
      // generate clientSecret
      const { client_secret } = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        automatic_payment_methods: {
          enabled: true,
        },
      })
      // send client secret as response
      res.send({ clientSecret: client_secret })
    })
     // get all payments
    app.get("/payment",verifyToken,verifyCreator, async(req,res)=>{
      const result = await paymentCollection.find().toArray();
      res.send(result);
    })
    // Save a payment data in db
    app.post('/payment', verifyToken, verifyCreator, async (req, res) => {
      const paymentData = req.body
      const result = await paymentCollection.insertOne(paymentData)
      res.send(result)
    })


    // user related api
    // get all users
    app.get("/users",verifyToken,verifyAdmin, async(req,res)=>{
      const result = await userCollection.find().toArray();
      res.send(result);
    })

    // get specific user
    app.get('/users/:email', async (req, res) => {
      const email = req.params.email
      const result = await userCollection.findOne({ email })
      res.send(result)
    })

    // verifyadminorNot
    app.get("/users/admin/:email", verifyToken, async(req,res)=>{
      const email = req.params.email;
      if(email !==req.decoded.email){
        return res.status(403).send({message:"Forbidden Access"});
      }
      const query = {email:email};
      const user = await userCollection.findOne(query);
      let admin =false;
      if(user){
        admin = user?.role==="admin";
      }
      res.send({admin});
    })

    // delete user
    app.delete("/users/:id", verifyToken,verifyAdmin, async(req,res)=>{
      const id =req.params.id;
      const query = {_id: new ObjectId(id)};
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })
    //update a user role
    app.patch('/users/update/:email', verifyToken,verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = { email };
      const updateDoc = {
        $set: { ...user, timestamp: Date.now() },
      }
      const result = await userCollection.updateOne(query, updateDoc)
      res.send(result)
    })
   // post all users
    app.put('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user?.email };
      // check if user already exists in db
      const isExist = await userCollection.findOne(query)
      if (isExist) {
        if (user.status === 'Requested') {
          // if existing user try to change his role
          const result = await userCollection.updateOne(query, {
            $set: { status: user?.status },
          })
          return res.send(result)
        } else {
          // if existing user login again
          return res.send(isExist)
        }
      }
      // save user for the first time
      const options = { upsert: true }
      const updateDoc = {
        $set: {
          ...user,
          timestamp: Date.now(),
        },
      }
      const result = await userCollection.updateOne(query, updateDoc, options)
      // // welcome new user
      // sendEmail(user?.email, {
      //   subject: 'Welcome to Stayvista!',
      //   message: `Hope you will find you destination`,
      // })
      res.send(result)
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get("/",(req,res)=>{
  res.send("PicoTask Rush server is Running")
})
app.listen(port,()=>{
  console.log(`PicoTash Rush Running on Port:${port}`);
})
