const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

dotenv.config();
const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_KEY);
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
        const paymentsCollection = db.collection("payments");
        const trackingCollection = db.collection("tracking");

        app.get("/parcels", async (req, res) => {
            try {
                const email = req.query.email;

                const query = email
                    ? { createdByEmail: email }
                    : {};

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

                // new add
                await trackingCollection.insertOne({
                    parcelId: result.insertedId,
                    trackingId: parcel.trackingId,
                    status: "pending",
                    note: "Parcel created",
                    location: parcel.senderRegion || "",
                    timestamp: new Date(),
                });
                //

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

        // GET: Get a single parcel by ID
        app.get('/parcels/:id', async (req, res) => {
            try {
                const { id } = req.params;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({
                        success: false,
                        message: 'Invalid parcel ID',
                    });
                }

                const query = { _id: new ObjectId(id) };
                const parcel = await parcelsCollection.findOne(query);

                if (!parcel) {
                    return res.status(404).send({
                        success: false,
                        message: 'Parcel not found',
                    });
                }

                res.send({
                    success: true,
                    data: parcel,
                });
            } catch (error) {
                console.error('Get parcel error:', error);

                res.status(500).send({
                    success: false,
                    message: 'Failed to fetch parcel',
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

        app.post("/create-payment-intent", async (req, res) => {
            try {
                const { parcelId } = req.body;

                if (!ObjectId.isValid(parcelId)) {
                    return res.status(400).send({
                        success: false,
                        message: "Invalid parcel ID",
                    });
                }

                const parcel = await parcelsCollection.findOne({
                    _id: new ObjectId(parcelId),
                });

                if (!parcel) {
                    return res.status(404).send({
                        success: false,
                        message: "Parcel not found",
                    });
                }

                if (parcel.paymentStatus === "paid") {
                    return res.status(400).send({
                        success: false,
                        message: "Parcel already paid",
                    });
                }

                const paymentIntent = await stripe.paymentIntents.create({
                    amount: Math.round(Number(parcel.deliveryCost) * 100),
                    currency: "usd",
                    metadata: {
                        parcelId: String(parcel._id),
                        userEmail: parcel.createdByEmail,
                    },
                });

                res.send({
                    success: true,
                    clientSecret: paymentIntent.client_secret,
                });
            } catch (error) {
                console.error("Create payment intent error:", error);

                res.status(500).send({
                    success: false,
                    message: "Failed to create payment intent",
                });
            }
        });

        app.post("/payments", async (req, res) => {
            try {
                const { parcelId, transactionId } = req.body;

                if (
                    !parcelId ||
                    !ObjectId.isValid(parcelId) ||
                    !transactionId
                ) {
                    return res.status(400).send({
                        success: false,
                        message: "Invalid payment information",
                    });
                }

                // Verify payment directly with Stripe
                const paymentIntent =
                    await stripe.paymentIntents.retrieve(transactionId);

                if (paymentIntent.status !== "succeeded") {
                    return res.status(400).send({
                        success: false,
                        message: "Payment is not successful",
                    });
                }

                // Verify parcel ID from Stripe metadata
                if (paymentIntent.metadata.parcelId !== parcelId) {
                    return res.status(403).send({
                        success: false,
                        message: "Parcel verification failed",
                    });
                }

                const parcelObjectId = new ObjectId(parcelId);

                const parcel = await parcelsCollection.findOne({
                    _id: parcelObjectId,
                });

                if (!parcel) {
                    return res.status(404).send({
                        success: false,
                        message: "Parcel not found",
                    });
                }

                // Check duplicate transaction
                const existingPayment = await paymentsCollection.findOne({
                    transactionId,
                });

                if (existingPayment) {
                    return res.send({
                        success: true,
                        message: "Payment already recorded",
                    });
                }

                // Save payment history
                await paymentsCollection.insertOne({
                    parcelId: parcelObjectId,
                    userEmail: parcel.createdByEmail,
                    transactionId,
                    amount: paymentIntent.amount_received,
                    currency: paymentIntent.currency,
                    paymentStatus: "paid",
                    paymentMethod: "stripe",
                    paidAt: new Date(),
                    createdAt: new Date(),
                });

                // Update parcel
                await parcelsCollection.updateOne(
                    { _id: parcelObjectId },
                    {
                        $set: {
                            paymentStatus: "paid",
                            paymentMethod: "stripe",
                            transactionId,
                            updatedAt: new Date(),
                        },
                    }
                );

                res.send({
                    success: true,
                    message: "Payment saved successfully",
                });
            } catch (error) {
                console.error("Payment save error:", error);

                res.status(500).send({
                    success: false,
                    message: "Failed to save payment",
                });
            }
        });
        //
        app.get('/payments', async (req, res) => {
            try {
                const email = req.query.email;

                if (!email) {
                    return res.status(400).send({
                        success: false,
                        message: 'Email is required',
                    });
                }

                const payments = await paymentsCollection
                    .find({ userEmail: email })
                    .sort({ createdAt: -1 })
                    .toArray();

                res.send({
                    success: true,
                    data: payments,
                });
            } catch (error) {
                console.error('Get payment history error:', error);

                res.status(500).send({
                    success: false,
                    message: 'Failed to load payment history',
                });
            }
        });

        //tracking
        app.post("/tracking", async (req, res) => {
            try {
                const { trackingId, status, note, location } = req.body;

                const allowedStatuses = [
                    "pending",
                    "picked_up",
                    "in_transit",
                    "arrived_at_hub",
                    "out_for_delivery",
                    "delivered",
                    "returned",
                ];

                if (
                    !trackingId ||
                    !status ||
                    !note ||
                    !allowedStatuses.includes(status)
                ) {
                    return res.status(400).send({
                        success: false,
                        message: "Invalid tracking information",
                    });
                }

                const parcel = await parcelsCollection.findOne({ trackingId });

                if (!parcel) {
                    return res.status(404).send({
                        success: false,
                        message: "Parcel not found",
                    });
                }

                const trackingEvent = {
                    parcelId: parcel._id,
                    trackingId: parcel.trackingId,
                    status,
                    note,
                    location: location || "",
                    timestamp: new Date(),
                };

                const result = await trackingCollection.insertOne(trackingEvent);

                res.status(201).send({
                    success: true,
                    message: "Tracking updated successfully",
                    insertedId: result.insertedId,
                });
            } catch (error) {
                console.error("Tracking update error:", error);

                res.status(500).send({
                    success: false,
                    message: "Failed to update tracking",
                });
            }
        });
        
        app.get("/tracking/:trackingId", async (req, res) => {
            try {
                const { trackingId } = req.params;

                const parcel = await parcelsCollection.findOne({ trackingId });

                if (!parcel) {
                    return res.status(404).send({
                        success: false,
                        message: "Parcel not found",
                    });
                }

                const trackingUpdates = await trackingCollection
                    .find({ trackingId })
                    .sort({ timestamp: -1 })
                    .toArray();

                res.send({
                    success: true,
                    data: {
                        parcel: {
                            trackingId: parcel.trackingId,
                            parcelTitle: parcel.parcelTitle,
                            senderRegion: parcel.senderRegion,
                            receiverRegion: parcel.receiverRegion,
                            createdAt: parcel.createdAt,
                            status: trackingUpdates[0]?.status || "pending",
                        },
                        trackingUpdates,
                    },
                });
            } catch (error) {
                console.error("Get tracking error:", error);

                res.status(500).send({
                    success: false,
                    message: "Failed to get tracking history",
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