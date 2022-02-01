import { Router } from "express";
import Joi from "joi";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { maxStringLength } from "../tools/constants";
import { logged, validating, withGlobalPreferences } from "../tools/middleware";
import {
  getUserFromField,
  createUser,
  storeInUser,
  changeSetting,
  getUsers,
} from "../database";
import { logger } from "../tools/logger";
import { GlobalPreferencesRequest, LoggedRequest } from "../tools/types";

const router = Router();
export default router;

const BCRYPT_SALTS = 14;

router.get("/", (req, res) => {
  res.status(200).send("Hello !");
});

const registerSchema = Joi.object().keys({
  username: Joi.string().max(maxStringLength).required(),
  password: Joi.string().max(maxStringLength).required(),
});

router.post(
  "/register",
  validating(registerSchema),
  withGlobalPreferences,
  async (req, res) => {
    const { globalPreferences } = req as GlobalPreferencesRequest;

    if (!globalPreferences || !globalPreferences.allowRegistrations) {
      return res.status(401).send({ code: "REGISTRATIONS_NOT_ALLOWED" });
    }

    const { username, password } = req.body;

    const alreadyExisting = await getUserFromField("username", username, false);

    if (alreadyExisting) {
      return res.status(409).send({ code: "USER_ALREADY_EXISTS" });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALTS);

    const newUser = await createUser(username, hashedPassword);
    return res.status(200).send(newUser);
  }
);

router.post("/logout", async (req, res) => {
  res.clearCookie("token");
  return res.status(200).end();
});

const loginSchema = Joi.object().keys({
  username: Joi.string().max(maxStringLength).required(),
  password: Joi.string().max(maxStringLength).required(),
});

router.post("/login", validating(loginSchema), async (req, res) => {
  const { username, password } = req.body;

  const user = await getUserFromField("username", username, false);

  if (!user) {
    return res.status(400).send({ code: "INCORRET_PASSWORD" });
  }

  // TODO filter user

  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).send({ code: "INCORRECT_PASSWORD" });
  }

  const token = jwt.sign({ userId: user._id.toString() }, "MyPrivateKey", {
    expiresIn: "1h",
  });

  res.cookie("token", token);

  return res.status(200).send({
    user,
    token,
  });
});

const changePassword = Joi.object().keys({
  oldPassword: Joi.string().max(maxStringLength).required(),
  newPassword: Joi.string().max(maxStringLength).required(),
});

router.post(
  "/changepassword",
  validating(changePassword),
  logged,
  async (req, res) => {
    const { user } = req as LoggedRequest;
    const { oldPassword, newPassword } = req.body;

    try {
      if (await bcrypt.compare(oldPassword, user.password)) {
        const newPasswordHashed = await bcrypt.hash(newPassword, BCRYPT_SALTS);
        await storeInUser("_id", user._id, { password: newPasswordHashed });
      } else {
        return res.status(403).end();
      }
      return res.status(200).end();
    } catch (e) {
      console.error(e);
      return res.status(500).end();
    }
  }
);

const changePasswordAccountId = Joi.object().keys({
  id: Joi.string().max(maxStringLength).required(),
  newPassword: Joi.string().max(maxStringLength).required(),
});

router.post(
  "/changepasswordaccountid",
  validating(changePasswordAccountId),
  logged,
  async (req, res) => {
    const { id, newPassword } = req.body;

    try {
      const newPasswordHashed = await bcrypt.hash(newPassword, BCRYPT_SALTS);
      await storeInUser("_id", id, { password: newPasswordHashed });
      return res.status(200).end();
    } catch (e) {
      console.error(e);
      return res.status(500).end();
    }
  }
);

const settingsSchema = Joi.object().keys({
  historyLine: Joi.bool(),
  preferredStatsPeriod: Joi.string()
    .only()
    .allow("day", "week", "month", "year"),
  nbElements: Joi.number().min(5).max(50),
  metricUsed: Joi.string().allow("number", "duration").only(),
});

router.post(
  "/settings",
  validating(settingsSchema),
  logged,
  async (req, res) => {
    const { user } = req as LoggedRequest;

    try {
      await changeSetting("_id", user._id, req.body);
      return res.status(200).end();
    } catch (e) {
      logger.error(e);
      return res.status(500).end();
    }
  }
);

router.get("/me", logged, async (req, res) => {
  const { user } = req as LoggedRequest;
  res.status(200).send(user);
});

router.get("/accountids", logged, async (req, res) => {
  try {
    const users = await getUsers(100, 0, {});
    return res
      .status(200)
      .send(users.map((us) => ({ username: us.username, id: us._id })));
  } catch (e) {
    console.error(e);
    return res.status(500).end();
  }
});

module.exports = router;