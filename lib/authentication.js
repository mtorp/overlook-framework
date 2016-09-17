// --------------------
// Overlook
// Authentication
// Authenticating user, login, logout etc
// --------------------

// modules
var _ = require('overlook-utils');

// libraries
var Promise = require('./promise'),
	crypto = require('./crypto'),
	cookies = require('./cookies');

// init

// exports

exports = module.exports = {
	login: function(email, password, remember, res, overlook) {
		return loginCheck(email, password, overlook)
		.then(function(user) {
			if (!user) return;

			// set session cookie
			setSessionCookie(user.id, res, overlook);

			// set persistent cookie
			if (remember) setLoginCookie(user.id, user.cookieKey, res, overlook);
			delete user.cookieKey;

			// return user
			return user;
		});
	},

	logout: function(user, res, overlook) {
		// kill cookies
		clearSessionCookie(res, overlook);
		clearLoginCookie(res, overlook);

		// wipe user
		delete user.id;
		delete user.name;
		delete user.isInitialized;

		// get permissions
		return getPermissions(user, overlook)
		.return(user);
	},

	processCookies: function(req, res, overlook) {
		return checkCookies(req, res, overlook)
		.then(function(user) {
			// get permissions
			return getPermissions(user, overlook)
			.return(user);
		});
	},

	getUser: function(userId, overlook) {
		return overlook.models.user.find({where: {id: userId}, attributes: ['name', 'isInitialized', 'isActive']})
		.then(function(user) {
			if (!user) return;

			// user found
			user = {
				id: userId,
				name: user.name,
				isInitialized: user.isInitialized,
				isActive: user.isActive
			};

			// get permissions
			return getPermissions(user, overlook)
			.return(user);
		});
	},

	makeHash: function(password) {
		return crypto.makeHash(password);
	},

	makeHashAndKey: function(password) {
		return Promise.all([
			crypto.makeHash(password),
			crypto.makeKey()
		]);
	},

	makePassword: function() {
		var chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXY3456789';

		var password = '';
		for (var i = 0; i < 10; i++) {
			var rand = Math.floor(Math.random() * chars.length);
			password += chars.substr(rand, 1);
		}

		return password;
	}
};

function checkCookies(req, res, overlook) {
	// check session cookie
	var cookie = getSessionCookie(req, res, overlook);
	var user = {};
	var userId;
	if (cookie) {
		if (cookie.timedOut) {
			user.timedOutId = cookie.u;
			req.log.debug('Session cookie timed out', {userId: user.timedOutId});
		} else {
			userId = cookie.u;
			req.log.debug('Session cookie present', {userId: userId});
		}
	}

	// if no active session cookie, check login cookie
	if (!userId) {
		cookie = getLoginCookie(req, res, overlook);

		if (cookie) {
			userId = cookie.u;
			req.log.debug('Login cookie present', {userId: userId});
		} else {
			// return empty user
			return Promise.resolve(user);
		}
	}

	// get user details from db and check against cookie
	return overlook.models.user.find({where: {id: userId, isActive: true}, attributes: ['name', 'cookieKey', 'isInitialized']})
	.then(function(dbUser) {
		if (!dbUser) {
			// user not found
			// kill cookies
			if (cookie.k) {
				clearLoginCookie(res, overlook);
			} else {
				clearSessionCookie(res, overlook);
			}

			req.log.debug('Login cookie user not found', {userId: userId});

			// return empty
			return user;
		}

		// check cookieKey valid if login cookie used
		if (cookie.k && dbUser.cookieKey != cookie.k) {
			// login cookie not valid
			clearLoginCookie(res, overlook);
			req.log.debug('Login cookie invalid', {userId: userId});

			return user;
		}

		// user found
		user = {
			id: userId,
			name: dbUser.name,
			isInitialized: dbUser.isInitialized
		};

		// refresh session cookie (so timeout on cookie is reset) or new session cookie set if login cookie used
		setSessionCookie(userId, res, overlook);

		// refresh login cookie if used
		if (cookie.k) setLoginCookie(userId, cookie.k, res, overlook);

		req.log('User authenticated', {user: user});

		// return user
		return user;
	});
}

function getSessionCookie(req, res, overlook) {
	// get cookie
	return cookies.getCookieWithTimeout(overlook.options.domain.sessionCookieName, req, res, overlook);
}

function setSessionCookie(userId, res, overlook) {
	// set cookie
	cookies.setCookie(overlook.options.domain.sessionCookieName, {u: userId}, overlook.options.domain.sessionCookieDuration, false, res, overlook);
}

function clearSessionCookie(res, overlook) {
	// clear cookie
	cookies.clearCookie(overlook.options.domain.sessionCookieName, res, overlook);
}

function getLoginCookie(req, res, overlook) {
	// get cookie
	return cookies.getCookie(overlook.options.domain.loginCookieName, req, res, overlook);
}

function setLoginCookie(userId, cookieKey, res, overlook) {
	// set cookie
	cookies.setCookie(overlook.options.domain.loginCookieName, {u: userId, k: cookieKey}, overlook.options.domain.loginCookieDuration, true, res, overlook);
}

function clearLoginCookie(res, overlook) {
	// clear cookie
	cookies.clearCookie(overlook.options.domain.loginCookieName, res, overlook);
}

function loginCheck(email, password, overlook) {
	return overlook.models.user.find({where: {email: email, isActive: true}, attributes: ['id', 'name', 'passwordHash', 'cookieKey']})
	.then(function(user) {
		// if no user found, return false
		if (!user) return false;

		// check password
		return crypto.checkPassword(password, user.passwordHash)
		.then(function(success) {
			if (!success) return false;

			// authentication succeeded
			user = {
				id: user.id,
				name: user.name,
				cookieKey: user.cookieKey
			};

			// get user permissions
			return getPermissions(user, overlook)
			.return(user);
		});
	});
}

function getPermissions(user, overlook) {
	// if no user id or user is not initialized, substitute public user id
	var userId = user.id;
	if (!userId || !user.isInitialized) userId = overlook.publicUserId;

	// get permissions for this user
	var models = overlook.models;
	return models.permission.findAll({
		include: {
			model: models.role,
			attributes: ['id'], //xxx required to work around sequelize bug
			include: {
				model: models.user,
				attributes: ['id'], //xxx required to work around sequelize bug
				where: {id: userId}
			}
		}
	})
	.then(function(permissionsArr) {
		// convert db data to permissions object
		var permissions = {};
		_.forEach(permissionsArr, function(permission) {
			permissions[permission.name] = true;
		});
		user.permissions = permissions;
	});
}
