const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

// MIDDLEWARE
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.r67f24r.mongodb.net/?appName=Cluster0`;

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
        await client.connect();

        const db = client.db("zap_shift_user");
        const parcelsCollection = db.collection("parcels");

        // parcels api
        app.get("/parcels", async (req, res) => {
            try {
                const email = req.query.email;

                const query = email ? { created_by: email } : {};

                const parcels = await parcelsCollection
                    .find(query)
                    .sort({ createdAt: -1 })
                    .toArray();

                res.send({
                    success: true,
                    data: parcels,
                });
            } catch (error) {
                console.error("Error fetching parcels:", error);

                res.status(500).send({
                    success: false,
                    message: "Failed to fetch parcels",
                });
            }
        });

        //POST 
        app.post("/parcels", async (req, res) => {
            try {
                const parcel = req.body;

                const result = await parcelsCollection.insertOne(parcel);

                res.status(201).send({
                    success: true,
                    message: "Parcel created successfully",
                    insertedId: result.insertedId,
                });
            } catch (error) {
                console.error("Error creating parcel:", error);

                res.status(500).send({
                    success: false,
                    message: "Failed to create parcel",
                });
            }
        });

        //delete
        app.delete("/parcels/:id", async (req, res) => {
            try {
                const id = req.params.id;

                const result = await parcelsCollection.deleteOne({
                    _id: new ObjectId(id),
                });

                if (result.deletedCount === 0) {
                    return res.status(404).send({
                        success: false,
                        message: "Parcel not found",
                    });
                }

                // response
                res.status(200).send({
                    success: true,
                    message: "Parcel deleted successfully",
                });
            } catch (error) {
                console.error("Delete error:", error);

                res.status(500).send({
                    success: false,
                    message: "Failed to delete parcel",
                });
            }
        });
        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

// simple ROUTE
app.get("/", (req, res) => {
    res.send("ZapShift Server is Running!");
});

// START SERVER
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});