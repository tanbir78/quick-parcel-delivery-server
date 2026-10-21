const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
// const admin = require("firebase-admin");

dotenv.config();
const stripe = require('stripe')(process.env.PAYMENT_GATEWAY_KEY);
const app = express();
const PORT = process.env.PORT || 5000;

// MIDDLEWARE
app.use(cors());
app.use(express.json());

// const serviceAccount = require("./firebase-admin-key.json");
// admin.initializeApp({
//     credential: admin.credential.cert(serviceAccount)
// });
const serviceAccount = require("./firebase-admin-key.json");

initializeApp({
    credential: cert(serviceAccount),
});

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
        const usersCollection = db.collection('users');
        const parcelsCollection = db.collection("parcels");
        const paymentsCollection = db.collection("payments");
        const trackingCollection = db.collection("tracking");
        const riderApplicationsCollection = db.collection("riderApplications");
        const cashoutsCollection = db.collection("cashouts");

        // custom middlewares
        const verifyFBToken = async (req, res, next) => {
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).send({ message: 'unauthorized access' })
            }
            const token = authHeader.split(' ')[1];
            if (!token) {
                return res.status(401).send({ message: 'unauthorized access' })
            }

            // verify the token
            try {
                // const decoded = await admin.auth().verifyIdToken(token);
                const decoded = await getAuth().verifyIdToken(token);
                req.decoded = decoded;

                // console.log("Decoded name:", req.decoded.name);
                // console.log("Decoded email:", req.decoded.email);
                next();
            }
            catch (error) {
                return res.status(403).send({ message: 'forbidden access' })
            }
        }
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            if (!user || user.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }
        const verifyRider = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            if (!user || user.role !== 'rider') {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }

        // Tracking event helper
        const createTrackingEvent = async ({
            parcel,
            status,
            title,
            description,
            actorRole = "system",
        }) => {
            await trackingCollection.insertOne({
                parcelId: parcel._id,
                trackingId: parcel.trackingId,
                status,
                title,
                description,
                actorRole,
                createdAt: new Date(),
                isPublic: true,
            });
        };

        // Public parcel tracking API
        // app.get("/tracking/:trackingId", async (req, res) => {
        //     try {
        //         const { trackingId } = req.params;

        //         const parcel = await parcelsCollection.findOne(
        //             { trackingId },
        //             {
        //                 projection: {
        //                     trackingId: 1,
        //                     parcelTitle: 1,
        //                     parcelType: 1,
        //                     senderRegion: 1,
        //                     receiverRegion: 1,
        //                     senderServiceCenter: 1,
        //                     receiverServiceCenter: 1,
        //                     status: 1,
        //                     paymentStatus: 1,
        //                     delivery_status: 1,
        //                     submittedAt: 1,
        //                     paidAt: 1,
        //                     assignedAt: 1,
        //                     pickedUpAt: 1,
        //                     deliveredAt: 1,
        //                 },
        //             }
        //         );

        //         if (!parcel) {
        //             return res.status(404).send({
        //                 success: false,
        //                 message: "Parcel not found",
        //             });
        //         }

        //         const trackingHistory = await trackingCollection
        //             .find({ trackingId, isPublic: true })
        //             .sort({ createdAt: 1 })
        //             .toArray();

        //         res.send({
        //             success: true,
        //             parcel,
        //             trackingHistory,
        //         });
        //     } catch (error) {
        //         console.error("Tracking API error:", error);

        //         res.status(500).send({
        //             success: false,
        //             message: error.message,
        //         });
        //     }
        // });

        app.get("/tracking/:trackingId", async (req, res) => {
            try {
                const { trackingId } = req.params;

                const parcel = await parcelsCollection.findOne(
                    { trackingId },
                    {
                        projection: {
                            trackingId: 1,
                            parcelTitle: 1,
                            parcelType: 1,
                            senderRegion: 1,
                            receiverRegion: 1,
                            senderServiceCenter: 1,
                            receiverServiceCenter: 1,
                            status: 1,
                            paymentStatus: 1,
                            delivery_status: 1,
                            submittedAt: 1,
                            paidAt: 1,
                            assignedAt: 1,
                            pickedUpAt: 1,
                            deliveredAt: 1,
                        },
                    }
                );

                if (!parcel) {
                    return res.status(404).send({
                        success: false,
                        message: "Parcel not found",
                    });
                }

                const trackingHistory = await trackingCollection
                    .find(
                        { trackingId, isPublic: true },
                        {
                            projection: {
                                trackingId: 1,
                                status: 1,
                                title: 1,
                                description: 1,
                                createdAt: 1,
                                location: 1,
                                riderName: 1,
                                riderEmail: 1,
                                riderPhone: 1,
                            },
                        }
                    )
                    .sort({ createdAt: 1 })
                    .toArray();

                res.send({
                    success: true,
                    parcel,
                    trackingHistory,
                });
            } catch (error) {
                console.error("Tracking API error:", error);

                res.status(500).send({
                    success: false,
                    message: "Failed to retrieve tracking information.",
                });
            }
        });

        app.post("/tracking", verifyFBToken, async (req, res) => {
            try {
                const {
                    parcelId,
                    trackingId,
                    status,
                    title,
                    description,
                } = req.body;

                if (
                    !parcelId ||
                    !ObjectId.isValid(parcelId) ||
                    !trackingId ||
                    !status ||
                    !title ||
                    !description
                ) {
                    return res.status(400).send({
                        success: false,
                        message: "Missing or invalid tracking information",
                    });
                }

                const parcel = await parcelsCollection.findOne({
                    _id: new ObjectId(parcelId),
                    trackingId,
                });

                if (!parcel) {
                    return res.status(404).send({
                        success: false,
                        message: "Parcel not found",
                    });
                }

                const result = await trackingCollection.insertOne({
                    parcelId: parcel._id,
                    trackingId: parcel.trackingId,
                    status,
                    title,
                    description,

                    riderName: req.body.riderName || "",
                    riderEmail: req.body.riderEmail || "",
                    riderPhone: req.body.riderPhone || "",
                    location: req.body.location || "",

                    actorRole: "system",
                    createdAt: new Date(),
                    isPublic: true,
                });

                res.send({
                    success: true,
                    insertedId: result.insertedId,
                });
            } catch (error) {
                console.error("POST /tracking error:", error);

                res.status(500).send({
                    success: false,
                    message: error.message,
                });
            }
        });

        //
        const calculateRiderEarning = (parcel) => {
            const senderDistrict = String(
                parcel.senderDistrict || parcel.senderRegion || ""
            ).trim().toLowerCase();

            const receiverDistrict = String(
                parcel.receiverDistrict || parcel.receiverRegion || ""
            ).trim().toLowerCase();

            const fee = Number(parcel.deliveryCost) || 0;

            const sameDistrict =
                senderDistrict !== "" &&
                receiverDistrict !== "" &&
                senderDistrict === receiverDistrict;

            const percentage = sameDistrict ? 80 : 30;

            return {
                deliveryFee: fee,
                earningPercentage: percentage,
                riderEarning: Number(
                    (fee * percentage / 100).toFixed(2)
                ),
                routeType: sameDistrict ? "same-district" : "different-district",
            };
        };

        //
        app.get("/rider/earnings-summary", verifyFBToken, async (req, res) => {
            try {
                const riderEmail = req.decoded.email;

                if (!riderEmail) {
                    return res.status(401).send({ message: "Unauthorized" });
                }

                // 1. Verify active rider
                const rider = await riderApplicationsCollection.findOne({
                    email: riderEmail,
                    status: "active",
                });

                if (!rider) {
                    return res.status(403).send({
                        message: "Only active riders can access earnings.",
                    });
                }

                // 2. Fetch this rider's completed deliveries
                const parcels = await parcelsCollection
                    .find({
                        assignedRiderEmail: riderEmail,
                        delivery_status: {
                            $in: ["delivered", "service center delivered"],
                        },
                    })
                    .toArray();

                // 3. Fetch this rider's cashout records
                const allCashouts = await cashoutsCollection
                    .find({ riderEmail })
                    .sort({ requestedAt: -1 })
                    .toArray();

                // Use the same earning calculation as Completed Deliveries
                const getEarning = (parcel) => {
                    const result = calculateRiderEarning(parcel);
                    return Number(result.riderEarning) || 0;
                };

                // Match cashouts only to completed parcels belonging to this rider.
                // This excludes unrelated dummy records and prevents cashouts
                // for nonexistent/uncompleted parcels from inflating totals.
                const parcelMap = new Map(
                    parcels.map((parcel) => [String(parcel._id), parcel])
                );

                // Keep only the newest cashout record per parcel.
                const latestCashoutByParcel = new Map();

                for (const cashout of allCashouts) {
                    const parcelId = String(cashout.parcelId);

                    if (
                        parcelMap.has(parcelId) &&
                        !latestCashoutByParcel.has(parcelId)
                    ) {
                        latestCashoutByParcel.set(parcelId, cashout);
                    }
                }

                // 4. Calculate totals parcel by parcel
                let totalEarnings = 0;
                let totalCashout = 0;
                let requestedCashout = 0;
                let availableEarnings = 0;

                const completedWithEarnings = parcels.map((parcel) => {
                    const earning = getEarning(parcel);
                    const cashout = latestCashoutByParcel.get(String(parcel._id));

                    totalEarnings += earning;

                    if (cashout?.status === "paid") {
                        totalCashout += Number(cashout.amount) || 0;
                    } else if (cashout?.status === "requested") {
                        requestedCashout += Number(cashout.amount) || 0;
                    } else {
                        availableEarnings += earning;
                    }

                    return {
                        parcel,
                        earning,
                        date: new Date(
                            parcel.deliveredAt || parcel.updatedAt || parcel.assignedAt
                        ),
                    };
                });

                totalEarnings = Number(totalEarnings.toFixed(2));
                totalCashout = Number(totalCashout.toFixed(2));
                requestedCashout = Number(requestedCashout.toFixed(2));
                availableEarnings = Number(availableEarnings.toFixed(2));

                // Pending = available + requested; excludes money already paid.
                const pendingEarnings = Number(
                    (availableEarnings + requestedCashout).toFixed(2)
                );

                const averagePerDelivery = parcels.length
                    ? Number((totalEarnings / parcels.length).toFixed(2))
                    : 0;

                // 5. Date helpers using Bangladesh local time
                const dateKey = (date) =>
                    new Intl.DateTimeFormat("en-CA", {
                        timeZone: "Asia/Dhaka",
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                    }).format(date);

                const monthKey = (date) =>
                    new Intl.DateTimeFormat("en-CA", {
                        timeZone: "Asia/Dhaka",
                        year: "numeric",
                        month: "2-digit",
                    }).format(date);

                const parts = new Intl.DateTimeFormat("en-GB", {
                    timeZone: "Asia/Dhaka",
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                }).formatToParts(new Date());

                const dateParts = Object.fromEntries(
                    parts
                        .filter((part) => part.type !== "literal")
                        .map((part) => [part.type, part.value])
                );

                const todayKey = dateKey(new Date());
                const todayStart = new Date(`${todayKey}T00:00:00+06:00`);
                const tomorrowStart = new Date(
                    todayStart.getTime() + 86400000
                );

                const todayWeekday = new Date(
                    `${todayKey}T12:00:00+06:00`
                ).getUTCDay();

                const daysSinceMonday = (todayWeekday + 6) % 7;

                const weekStart = new Date(
                    todayStart.getTime() - daysSinceMonday * 86400000
                );

                const monthStart = new Date(
                    `${dateParts.year}-${dateParts.month}-01T00:00:00+06:00`
                );

                const yearStart = new Date(
                    `${dateParts.year}-01-01T00:00:00+06:00`
                );

                const validDeliveries = completedWithEarnings.filter(
                    (item) => !Number.isNaN(item.date.getTime())
                );

                const sumBetween = (start, end) =>
                    Number(
                        validDeliveries
                            .filter(
                                ({ date }) => date >= start && date < end
                            )
                            .reduce((sum, item) => sum + item.earning, 0)
                            .toFixed(2)
                    );

                const totalsByPeriod = {
                    today: sumBetween(todayStart, tomorrowStart),
                    week: sumBetween(weekStart, tomorrowStart),
                    month: sumBetween(monthStart, tomorrowStart),
                    year: sumBetween(yearStart, tomorrowStart),
                    overall: totalEarnings,
                };

                // 6. Group earnings for chart
                const dailyTotals = new Map();
                const monthlyTotals = new Map();

                validDeliveries.forEach(({ date, earning }) => {
                    const day = dateKey(date);
                    const month = monthKey(date);

                    dailyTotals.set(
                        day,
                        (dailyTotals.get(day) || 0) + earning
                    );

                    monthlyTotals.set(
                        month,
                        (monthlyTotals.get(month) || 0) + earning
                    );
                });

                const amount = (value) =>
                    Number((value || 0).toFixed(2));

                const analysis = {
                    today: [
                        {
                            label: "Today",
                            amount: totalsByPeriod.today,
                        },
                    ],

                    week: Array.from({ length: 7 }, (_, index) => {
                        const date = new Date(
                            weekStart.getTime() + index * 86400000
                        );

                        return {
                            label: new Intl.DateTimeFormat("en-US", {
                                timeZone: "Asia/Dhaka",
                                weekday: "short",
                            }).format(date),
                            amount: amount(dailyTotals.get(dateKey(date))),
                        };
                    }),

                    month: Array.from(
                        { length: Number(dateParts.day) },
                        (_, index) => {
                            const date = new Date(
                                monthStart.getTime() + index * 86400000
                            );

                            return {
                                label: String(index + 1),
                                amount: amount(dailyTotals.get(dateKey(date))),
                            };
                        }
                    ),

                    year: Array.from({ length: 12 }, (_, index) => {
                        const key = `${dateParts.year}-${String(index + 1).padStart(2, "0")}`;

                        return {
                            label: new Intl.DateTimeFormat("en-US", {
                                month: "short",
                                timeZone: "Asia/Dhaka",
                            }).format(new Date(`${key}-01T12:00:00+06:00`)),
                            amount: amount(monthlyTotals.get(key)),
                        };
                    }),

                    overall: [...monthlyTotals.entries()]
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([key, value]) => ({
                            label: key,
                            amount: amount(value),
                        })),
                };

                console.log("Rider earnings summary:", {
                    riderEmail,
                    completedDeliveries: parcels.length,
                    matchedCashouts: latestCashoutByParcel.size,
                    totalEarnings,
                    totalCashout,
                    requestedCashout,
                    pendingEarnings,
                    availableEarnings,
                });

                return res.send({
                    summary: {
                        totalEarnings,
                        totalCashout,
                        pendingEarnings,
                        requestedCashout,
                        availableEarnings,
                        completedDeliveries: parcels.length,
                        averagePerDelivery,
                    },
                    totalsByPeriod,
                    analysis,
                });
            } catch (error) {
                console.error("Rider earnings summary error:", error);

                return res.status(500).send({
                    message: "Failed to load earnings summary.",
                });
            }
        });

        app.get("/rider/completed-deliveries", verifyFBToken, async (req, res) => {
            try {
                const riderEmail = req.decoded.email;

                // Confirm that the authenticated user is an active rider.
                const rider = await riderApplicationsCollection.findOne({
                    email: riderEmail,
                    status: "active",
                });

                if (!rider) {
                    return res.status(403).send({
                        message: "Only active riders can access this resource.",
                    });
                }

                const parcels = await parcelsCollection
                    .find({
                        assignedRiderEmail: riderEmail,
                        delivery_status: {
                            $in: [
                                "delivered",
                                "service center delivered",
                            ],
                        },
                    })
                    .sort({ deliveredAt: -1, updatedAt: -1 })
                    .toArray();

                const result = parcels.map((parcel) => {
                    const earning = calculateRiderEarning(parcel);

                    return {
                        ...parcel,
                        ...earning,
                        cashoutStatus: parcel.cashoutStatus || "available",
                    };
                });

                res.send(result);
            } catch (error) {
                console.error("Completed deliveries error:", error);

                res.status(500).send({
                    message: "Failed to fetch completed deliveries.",
                });
            }
        }
        );

        app.post("/rider/cashout/:parcelId", verifyFBToken, async (req, res) => {
            try {
                const { parcelId } = req.params;
                const riderEmail = req.decoded.email;

                if (!riderEmail) {
                    return res.status(401).send({
                        message: "Unauthorized.",
                    });
                }

                if (!ObjectId.isValid(parcelId)) {
                    return res.status(400).send({
                        message: "Invalid parcel ID.",
                    });
                }

                // 1. Verify active rider
                const rider = await riderApplicationsCollection.findOne({
                    email: riderEmail,
                    status: "active",
                });

                if (!rider) {
                    return res.status(403).send({
                        message: "Only active riders can request cash out.",
                    });
                }

                const parcelObjectId = new ObjectId(parcelId);

                // 2. Verify this parcel belongs to this rider and is completed
                const parcel = await parcelsCollection.findOne({
                    _id: parcelObjectId,
                    assignedRiderEmail: riderEmail,
                    delivery_status: {
                        $in: ["delivered", "service center delivered"],
                    },
                });

                if (!parcel) {
                    return res.status(404).send({
                        message: "Completed parcel not found for this rider.",
                    });
                }

                // 3. Check parcel cashout status
                const currentStatus = String(
                    parcel.cashoutStatus || "available"
                ).toLowerCase();

                if (["requested", "paid"].includes(currentStatus)) {
                    return res.status(409).send({
                        message: "Cash-out has already been requested for this parcel.",
                    });
                }

                // 4. Check existing cashout record as an extra safeguard
                const existingCashout = await cashoutsCollection.findOne({
                    parcelId: parcelObjectId,
                    riderEmail,
                    status: { $in: ["requested", "paid"] },
                });

                if (existingCashout) {
                    return res.status(409).send({
                        message: "A cash-out record already exists for this parcel.",
                    });
                }

                // 5. Calculate earning on the server
                const earning = calculateRiderEarning(parcel);
                const earningAmount = Number(earning.riderEarning);

                if (!Number.isFinite(earningAmount) || earningAmount <= 0) {
                    return res.status(400).send({
                        message: "No payable earning is available for this parcel.",
                    });
                }

                const now = new Date().toISOString();

                // 6. Atomically claim the parcel for cash out
                const claim = await parcelsCollection.updateOne(
                    {
                        _id: parcelObjectId,
                        assignedRiderEmail: riderEmail,
                        delivery_status: {
                            $in: ["delivered", "service center delivered"],
                        },
                        cashoutStatus: {
                            $nin: ["requested", "paid"],
                        },
                    },
                    {
                        $set: {
                            cashoutStatus: "requested",
                            cashoutRequestedAt: now,
                            riderEarning: earningAmount,
                            earningPercentage: earning.earningPercentage,
                            earningRouteType: earning.routeType,
                        },
                    }
                );

                if (claim.modifiedCount !== 1) {
                    return res.status(409).send({
                        message: "Cash-out already requested. Please refresh.",
                    });
                }

                // 7. Create cashout record
                const cashout = {
                    parcelId: parcelObjectId,
                    trackingId: parcel.trackingId || "",
                    riderEmail,
                    riderName: rider.name || "",
                    deliveryFee: earning.deliveryFee,
                    earningPercentage: earning.earningPercentage,
                    amount: earningAmount,
                    routeType: earning.routeType,
                    status: "requested",
                    requestedAt: now,
                    reviewedAt: null,
                    reviewedBy: null,
                    paidAt: null,
                };

                try {
                    const inserted = await cashoutsCollection.insertOne(cashout);

                    return res.status(201).send({
                        success: true,
                        message: "Cash-out request submitted successfully.",
                        cashoutId: inserted.insertedId,
                        amount: earningAmount,
                        status: "requested",
                    });
                } catch (insertError) {
                    // Roll back parcel claim if cashout insert fails
                    await parcelsCollection.updateOne(
                        {
                            _id: parcelObjectId,
                            assignedRiderEmail: riderEmail,
                            cashoutStatus: "requested",
                            cashoutRequestedAt: now,
                        },
                        {
                            $set: {
                                cashoutStatus: "available",
                            },
                            $unset: {
                                cashoutRequestedAt: "",
                                riderEarning: "",
                                earningPercentage: "",
                                earningRouteType: "",
                            },
                        }
                    );

                    throw insertError;
                }
            } catch (error) {
                console.error("Cash-out request error:", error);

                return res.status(500).send({
                    message: "Failed to create cash-out request.",
                });
            }
        });

        app.patch("/admin/cashouts/:cashoutId/approve", verifyFBToken, verifyAdmin, async (req, res) => {
            try {
                const { cashoutId } = req.params;

                if (!ObjectId.isValid(cashoutId)) {
                    return res.status(400).send({
                        message: "Invalid cash-out ID.",
                    });
                }

                const cashoutObjectId = new ObjectId(cashoutId);
                const now = new Date().toISOString();

                const cashout = await cashoutsCollection.findOne({
                    _id: cashoutObjectId,
                    status: "requested",
                });

                if (!cashout) {
                    return res.status(404).send({
                        message: "Pending cash-out request not found.",
                    });
                }

                const parcelUpdate = await parcelsCollection.updateOne(
                    {
                        _id: cashout.parcelId,
                        assignedRiderEmail: cashout.riderEmail,
                        cashoutStatus: "requested",
                    },
                    {
                        $set: {
                            cashoutStatus: "paid",
                            cashoutPaidAt: now,
                        },
                    }
                );

                if (parcelUpdate.modifiedCount !== 1) {
                    return res.status(409).send({
                        message: "Parcel cash-out status has changed.",
                    });
                }

                const cashoutUpdate = await cashoutsCollection.updateOne(
                    {
                        _id: cashoutObjectId,
                        status: "requested",
                    },
                    {
                        $set: {
                            status: "paid",
                            reviewedAt: now,
                            reviewedBy: req.decoded.email,
                            paidAt: now,
                        },
                    }
                );

                if (cashoutUpdate.modifiedCount !== 1) {
                    // Compensate if another request changed the cashout record.
                    await parcelsCollection.updateOne(
                        {
                            _id: cashout.parcelId,
                            cashoutStatus: "paid",
                            cashoutPaidAt: now,
                        },
                        {
                            $set: {
                                cashoutStatus: "requested",
                            },
                            $unset: {
                                cashoutPaidAt: "",
                            },
                        }
                    );

                    return res.status(409).send({
                        message: "Cash-out request has already been processed.",
                    });
                }

                res.send({
                    success: true,
                    message: "Cash-out marked as paid.",
                    amount: cashout.amount,
                });
            } catch (error) {
                console.error("Cash-out approval error:", error);

                res.status(500).send({
                    message: "Failed to approve cash-out.",
                });
            }
        }
        );

        //
        app.get("/rider/delivery-tasks", verifyFBToken, verifyRider, async (req, res) => {
            try {
                const riderEmail = req.decoded.email;

                const parcels = await parcelsCollection
                    .find({
                        assignedRiderEmail: riderEmail,
                        delivery_status: {
                            $in: ["assigned", "pending-pickup", "in-transit"],
                        },
                    })
                    .sort({ assignedAt: -1 })
                    .toArray();

                res.send(parcels);
            } catch (error) {
                console.error(error);
                res.status(500).send({
                    message: "Failed to fetch delivery tasks.",
                });
            }
        }

        );


        app.patch("/rider/delivery-tasks/:parcelId/status", verifyFBToken, verifyRider, async (req, res) => {
            try {
                const { parcelId } = req.params;
                const { action } = req.body;
                const riderEmail = req.decoded.email;

                if (!ObjectId.isValid(parcelId)) {
                    return res.status(400).send({
                        message: "Invalid parcel ID.",
                    });
                }

                if (!["picked-up", "delivered"].includes(action)) {
                    return res.status(400).send({
                        message: "Invalid delivery action.",
                    });
                }

                const parcelObjectId = new ObjectId(parcelId);

                const parcel = await parcelsCollection.findOne({
                    _id: parcelObjectId,
                    assignedRiderEmail: riderEmail,
                });

                if (!parcel) {
                    return res.status(404).send({
                        message: "Assigned parcel not found.",
                    });
                }

                const currentStatus = (
                    parcel.delivery_status || ""
                ).toLowerCase();

                let allowedStatuses;
                let newStatus;
                let newDeliveryStatus;

                if (action === "picked-up") {
                    allowedStatuses = ["assigned", "pending-pickup"];
                    newStatus = "in transit";
                    newDeliveryStatus = "in-transit";
                } else {
                    allowedStatuses = ["in-transit"];
                    newStatus = "delivered";
                    newDeliveryStatus = "delivered";
                }

                if (!allowedStatuses.includes(currentStatus)) {
                    return res.status(409).send({
                        message:
                            action === "picked-up"
                                ? "This parcel cannot be picked up in its current status."
                                : "Only in-transit parcels can be marked as delivered.",
                    });
                }

                const now = new Date().toISOString();

                const updateFields = {
                    status: newStatus,
                    delivery_status: newDeliveryStatus,
                    updatedAt: now,
                };

                if (action === "picked-up") {
                    updateFields.pickedUpAt = now;
                } else {
                    updateFields.deliveredAt = now;
                }

                const result = await parcelsCollection.updateOne(
                    {
                        _id: parcelObjectId,
                        assignedRiderEmail: riderEmail,
                        delivery_status: parcel.delivery_status,
                    },
                    {
                        $set: updateFields,
                        $push: {
                            trackingHistory: {
                                status: newDeliveryStatus,
                                updatedAt: now,
                                updatedBy: riderEmail,
                            },
                        },
                    }
                );

                if (result.modifiedCount !== 1) {
                    return res.status(409).send({
                        message:
                            "Parcel status changed. Refresh and try again.",
                    });
                }

                res.send({
                    success: true,
                    message:
                        action === "picked-up"
                            ? "Parcel marked as picked up."
                            : "Parcel marked as delivered.",
                    status: newStatus,
                    delivery_status: newDeliveryStatus,
                });
            } catch (error) {
                console.error("Update delivery status error:", error);

                res.status(500).send({
                    message: "Failed to update delivery status.",
                });
            }
        }
        );

        // assign riders
        app.get(
            "/parcels/assign-rider",
            verifyFBToken,
            verifyAdmin,
            async (req, res) => {
                try {
                    const parcels = await parcelsCollection
                        .find({
                            status: "pending",
                            paymentStatus: "paid",
                        })
                        .sort({ creation_date: -1 })
                        .toArray();

                    res.send(parcels);
                } catch (error) {
                    console.error("Error fetching parcels for rider assignment:", error);

                    res.status(500).send({
                        message: "Failed to fetch parcels for rider assignment.",
                    });
                }
            }
        );
        app.get(
            "/riders/available",
            verifyFBToken,
            verifyAdmin,
            async (req, res) => {
                try {
                    const district = req.query.district?.trim();

                    if (!district) {
                        return res.status(400).send({
                            message: "District is required.",
                        });
                    }

                    const escapedDistrict = district.replace(
                        /[.*+?^${}()|[\]\\]/g,
                        "\\$&"
                    );

                    const riders = await riderApplicationsCollection
                        .find(
                            {
                                district: {
                                    $regex: `^${escapedDistrict}$`,
                                    $options: "i",
                                },
                                status: "active",
                            },
                            {
                                projection: {
                                    name: 1,
                                    email: 1,
                                    phone: 1,
                                    district: 1,
                                    region: 1,
                                    bikeBrand: 1,
                                    bikeRegistrationNumber: 1,
                                },
                            }
                        )
                        .toArray();

                    res.send(riders);
                } catch (error) {
                    console.error("Error fetching riders:", error);

                    res.status(500).send({
                        message: "Failed to fetch riders.",
                    });
                }
            }
        );
        app.patch("/parcels/:parcelId/assign-rider", verifyFBToken, verifyAdmin, async (req, res) => {
            try {
                const { parcelId } = req.params;
                const { riderId } = req.body;

                if (
                    !ObjectId.isValid(parcelId) ||
                    !ObjectId.isValid(riderId)
                ) {
                    return res.status(400).send({
                        message: "Invalid parcel or rider ID.",
                    });
                }

                const parcelObjectId = new ObjectId(parcelId);
                const riderObjectId = new ObjectId(riderId);

                // Find parcel
                const parcel = await parcelsCollection.findOne({
                    _id: parcelObjectId,
                });

                if (!parcel) {
                    return res.status(404).send({
                        message: "Parcel not found.",
                    });
                }

                if (
                    parcel.status !== "pending" ||
                    parcel.paymentStatus !== "paid"
                ) {
                    return res.status(400).send({
                        message: "This parcel cannot be assigned.",
                    });
                }

                // Find active rider
                const rider = await riderApplicationsCollection.findOne({
                    _id: riderObjectId,
                    status: "active",
                });

                if (!rider) {
                    return res.status(404).send({
                        message: "Active rider not found.",
                    });
                }

                if (rider.workStatus === "in delivery") {
                    return res.status(409).send({
                        message: "This rider is already delivering a parcel.",
                    });
                }

                // Match rider district with parcel service center
                if (
                    rider.district?.trim().toLowerCase() !==
                    parcel.receiverServiceCenter?.trim().toLowerCase()
                ) {
                    return res.status(400).send({
                        message: "Rider district does not match the parcel service center.",
                    });
                }

                // Update parcel
                const parcelUpdate = await parcelsCollection.updateOne(
                    {
                        _id: parcelObjectId,
                        status: "pending",
                        paymentStatus: "paid",
                    },
                    {
                        $set: {
                            delivery_status: "in-transit",
                            assignedRiderId: riderObjectId,
                            assignedRiderName: rider.name || "",
                            assignedRiderEmail: rider.email,
                            assignedAt: new Date().toISOString(),
                        },
                    }
                );

                if (parcelUpdate.modifiedCount !== 1) {
                    return res.status(409).send({
                        message: "Parcel was already assigned or its status changed.",
                    });
                }

                // Update rider work status
                try {
                    const riderUpdate = await riderApplicationsCollection.updateOne(
                        {
                            _id: riderObjectId,
                            status: "active",
                            workStatus: { $ne: "in delivery" },
                        },
                        {
                            $set: {
                                workStatus: "in delivery",
                            },
                        }
                    );

                    if (riderUpdate.modifiedCount !== 1) {
                        // Roll back parcel assignment if rider update fails
                        await parcelsCollection.updateOne(
                            {
                                _id: parcelObjectId,
                                assignedRiderId: riderObjectId,
                            },
                            {
                                $set: {
                                    delivery_status: parcel.delivery_status || "pending",
                                },
                                $unset: {
                                    assignedRiderId: "",
                                    assignedRiderName: "",
                                    assignedRiderEmail: "",
                                    assignedAt: "",
                                },
                            }
                        );

                        return res.status(409).send({
                            message: "Rider is no longer available. Please select another rider.",
                        });
                    }
                } catch (error) {
                    // Roll back parcel assignment if rider update throws
                    await parcelsCollection.updateOne(
                        {
                            _id: parcelObjectId,
                            assignedRiderId: riderObjectId,
                        },
                        {
                            $set: {
                                delivery_status: parcel.delivery_status || "pending",
                            },
                            $unset: {
                                assignedRiderId: "",
                                assignedRiderName: "",
                                assignedRiderEmail: "",
                                assignedAt: "",
                            },
                        }
                    );

                    throw error;
                }

                res.send({
                    success: true,
                    message: "Rider assigned successfully.",
                    parcelId,
                    riderId,
                    delivery_status: "in-transit",
                    workStatus: "in delivery",
                });
            } catch (error) {
                console.error("Assign rider error:", error);

                res.status(500).send({
                    message: "Failed to assign rider.",
                });
            }
        }
        );

        // user role api
        app.get("/users/role", verifyFBToken, async (req, res) => {
            try {
                const email = req.query.email?.trim().toLowerCase();

                if (!email) {
                    return res.status(400).send({
                        message: "Email is required",
                    });
                }

                // Token email && requested email
                if (req.decoded.email?.toLowerCase() !== email) {
                    return res.status(403).send({
                        message: "Forbidden access",
                    });
                }

                const user = await usersCollection.findOne(
                    { email },
                    { projection: { role: 1, _id: 0 } }
                );

                if (!user) {
                    return res.status(404).send({
                        message: "User not found",
                    });
                }

                res.send({ role: user.role || "user" });
            } catch (error) {
                console.error("Get user role error:", error);

                res.status(500).send({
                    message: "Failed to get user role",
                });
            }
        });
        // for admin
        app.get("/users/search", async (req, res) => {
            try {
                const email = req.query.email?.trim();

                // if (!email || email.length < 3) {
                //     return res.status(400).send({
                //         message: "Enter at least 3 characters to search.",
                //     });
                // }

                const users = await usersCollection
                    .find(
                        { email: { $regex: email, $options: "i" } },
                        {
                            projection: {
                                email: 1,
                                created_at: 1,
                                role: 1,
                            },
                        }
                    )
                    .limit(10)
                    .toArray();

                res.send(users);
            } catch (error) {
                console.error("User search error:", error);
                res.status(500).send({ message: "Failed to search users." });
            }
        });
        app.patch("/users/:id/role", verifyFBToken, verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const { role } = req.body;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({
                        message: "Invalid user ID.",
                    });
                }

                if (!["admin", "user"].includes(role)) {
                    return res.status(400).send({
                        message: "Invalid role.",
                    });
                }

                // Prevent an admin from removing their own admin role.
                const targetUser = await usersCollection.findOne({
                    _id: new ObjectId(id),
                });

                if (!targetUser) {
                    return res.status(404).send({
                        message: "User not found.",
                    });
                }

                if (
                    targetUser.uid === req.decoded.uid &&
                    role === "user"
                ) {
                    return res.status(403).send({
                        message: "You cannot remove your own admin role.",
                    });
                }

                const result = await usersCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: { role } }
                );

                res.send({
                    success: true,
                    message: `User role updated to ${role}.`,
                });
            } catch (error) {
                console.error("Update user role error:", error);
                res.status(500).send({
                    message: "Failed to update user role.",
                });
            }
        });

        // rider applications data
        app.post("/riderApplications", verifyFBToken, async (req, res) => {
            try {
                const {
                    age,
                    region,
                    district,
                    phone,
                    nid,
                    bikeBrand,
                    bikeRegistrationNumber,
                    address,
                    experience,
                    emergencyContact,
                } = req.body;

                // Required-field validation
                if (
                    !age ||
                    !region ||
                    !district ||
                    !phone ||
                    !nid ||
                    !bikeBrand ||
                    !bikeRegistrationNumber ||
                    !address ||
                    !experience ||
                    !emergencyContact
                ) {
                    return res.status(400).send({
                        message: "Please provide all required information.",
                    });
                }

                // Prevent duplicate applications from the same account
                const existingApplication =
                    await riderApplicationsCollection.findOne({
                        uid: req.decoded.uid,
                    });

                // duplicate application handle

                // if (existingApplication) {
                //     return res.status(409).send({
                //         message: "You have already submitted a rider application.",
                //     });
                // }

                const riderApplication = {
                    uid: req.decoded.uid,
                    name: req.decoded.name || req.body.name || "",
                    email: req.decoded.email,
                    age,
                    region,
                    district,
                    phone,
                    nid,
                    bikeBrand,
                    bikeRegistrationNumber,
                    address,
                    experience,
                    emergencyContact,
                    status: "pending",
                    appliedAt: new Date(),
                };

                const result = await riderApplicationsCollection.insertOne(
                    riderApplication
                );

                res.status(201).send({
                    success: true,
                    message: "Rider application submitted successfully.",
                    insertedId: result.insertedId,
                });
            } catch (error) {
                console.error("Rider application error:", error);

                res.status(500).send({
                    message: "Failed to submit rider application.",
                });
            }
        });
        // GET: Pending Rider Applications
        app.get("/riderApplications/pending", verifyFBToken, verifyAdmin, async (req, res) => {
            try {
                const result = await riderApplicationsCollection
                    .find({ status: "pending" })
                    .sort({ appliedAt: -1 })
                    .toArray();

                res.send(result);
            } catch (error) {
                console.error("Error fetching pending riders:", error);
                res.status(500).send({
                    message: "Failed to fetch pending rider applications",
                });
            }
        });
        app.get("/riderApplications", verifyFBToken, async (req, res) => {
            try {
                const { status } = req.query;

                if (status !== "active") {
                    return res.status(400).send({
                        message: "Invalid status",
                    });
                }

                const activeRiders = await riderApplicationsCollection
                    .find({ status: "active" })
                    .sort({ appliedAt: -1 })
                    .toArray();

                res.status(200).send(activeRiders);
            } catch (error) {
                console.error("Fetch active riders error:", error);

                res.status(500).send({
                    message: "Failed to fetch active riders",
                });
            }
        }
        );
        app.patch("/riderApplications/:id/status", verifyFBToken, verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const { status, email } = req.body;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({
                        message: "Invalid rider ID",
                    });
                }
                if (!["active", "inactive", "rejected"].includes(status)) {
                    return res.status(400).send({
                        message: "Invalid status",
                    });
                }
                const currentStatus =
                    status === "inactive" ? "active" : "pending";

                const result = await riderApplicationsCollection.updateOne(
                    {
                        _id: new ObjectId(id),
                        status: currentStatus,
                    },
                    {
                        $set: {
                            status,
                            reviewedAt: new Date(),
                        },
                    }
                );

                //update user role for accepting rider
                if (status === 'active') {
                    const userQuery = { email };
                    const userUpdateDoc = {
                        $set: {
                            role: 'rider'
                        }
                    };
                    const roleResult = await usersCollection.updateOne(userQuery, userUpdateDoc)
                    console.log(roleResult.modifiedCount);
                }

                if (result.matchedCount === 0) {
                    return res.status(404).send({
                        message: "Rider not found or status has already changed",
                    });
                }

                res.send({
                    success: true,
                    message: `Rider status updated to ${status}`,
                });
            } catch (error) {
                console.error("Update rider status error:", error);

                res.status(500).send({
                    message: "Failed to update rider status",
                });
            }
        }
        );

        // app.get("/riderApplications/active", async (req, res) => {
        //     const result = await riderApplicationsCollection.find({ status: "approved" }).toArray();
        //     res.send(result);
        // })

        // user collection

        app.post('/users', async (req, res) => {
            const email = req.body.email;
            const userExists = await usersCollection.findOne({ email })
            if (userExists) {
                // update last log in
                return res.status(200).send({ message: 'User already exists', inserted: false });
            }
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            res.send(result);
        })

        // app.get("/parcels", async (req, res) => {
        //     // console.log('header in payments', req.headers);

        //     try {
        //         const email = req.query.email;
        //         console.log('decoded ', req.decoded);
        //         if (req.decoded.email !== email) {
        //             return res.status(403).send({ message: 'forbidden access' })
        //         }

        //         const query = email
        //             ? { createdByEmail: email }
        //             : {};

        //         const parcels = await parcelsCollection
        //             .find(query)
        //             .sort({ createdAt: -1 })
        //             .toArray();

        //         res.send({
        //             success: true,
        //             data: parcels,
        //         });
        //     } catch (error) {
        //         console.error("Error fetching parcels:", error);

        //         res.status(500).send({
        //             success: false,
        //             message: "Failed to fetch parcels",
        //         });
        //     }
        // });

        app.get("/parcels", verifyFBToken, async (req, res) => {
            try {
                const email = req.query.email?.trim();

                if (!email) {
                    return res.status(400).send({
                        success: false,
                        message: "Email is required",
                    });
                }

                console.log("Decoded email:", req.decoded.email);

                if (req.decoded.email?.toLowerCase() !== email.toLowerCase()) {
                    return res.status(403).send({
                        success: false,
                        message: "Forbidden access",
                    });
                }

                const parcels = await parcelsCollection
                    .find({ createdByEmail: email })
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

        // payment data post and get
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
        // app.post("/tracking", async (req, res) => {
        //     try {
        //         const { trackingId, status, note, location } = req.body;

        //         const allowedStatuses = [
        //             "pending",
        //             "picked_up",
        //             "in_transit",
        //             "arrived_at_hub",
        //             "out_for_delivery",
        //             "delivered",
        //             "returned",
        //         ];

        //         if (
        //             !trackingId ||
        //             !status ||
        //             !note ||
        //             !allowedStatuses.includes(status)
        //         ) {
        //             return res.status(400).send({
        //                 success: false,
        //                 message: "Invalid tracking information",
        //             });
        //         }

        //         const parcel = await parcelsCollection.findOne({ trackingId });

        //         if (!parcel) {
        //             return res.status(404).send({
        //                 success: false,
        //                 message: "Parcel not found",
        //             });
        //         }

        //         const trackingEvent = {
        //             parcelId: parcel._id,
        //             trackingId: parcel.trackingId,
        //             status,
        //             note,
        //             location: location || "",
        //             timestamp: new Date(),
        //         };

        //         const result = await trackingCollection.insertOne(trackingEvent);

        //         res.status(201).send({
        //             success: true,
        //             message: "Tracking updated successfully",
        //             insertedId: result.insertedId,
        //         });
        //     } catch (error) {
        //         console.error("Tracking update error:", error);

        //         res.status(500).send({
        //             success: false,
        //             message: "Failed to update tracking",
        //         });
        //     }
        // });

        // app.get("/tracking/:trackingId", async (req, res) => {
        //     try {
        //         const { trackingId } = req.params;

        //         const parcel = await parcelsCollection.findOne({ trackingId });

        //         if (!parcel) {
        //             return res.status(404).send({
        //                 success: false,
        //                 message: "Parcel not found",
        //             });
        //         }

        //         const trackingUpdates = await trackingCollection
        //             .find({ trackingId })
        //             .sort({ timestamp: -1 })
        //             .toArray();

        //         res.send({
        //             success: true,
        //             data: {
        //                 parcel: {
        //                     trackingId: parcel.trackingId,
        //                     parcelTitle: parcel.parcelTitle,
        //                     senderRegion: parcel.senderRegion,
        //                     receiverRegion: parcel.receiverRegion,
        //                     createdAt: parcel.createdAt,
        //                     status: trackingUpdates[0]?.status || "pending",
        //                 },
        //                 trackingUpdates,
        //             },
        //         });
        //     } catch (error) {
        //         console.error("Get tracking error:", error);

        //         res.status(500).send({
        //             success: false,
        //             message: "Failed to get tracking history",
        //         });
        //     }
        // });

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