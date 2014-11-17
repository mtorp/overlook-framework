// --------------------
// Permission model
// --------------------

// modules
var Sequelize = require('sequelize-extra');

// definition
module.exports = {
	fields: {
		name: {
			type: Sequelize.STRING(50),
			allowNull: false,
			unique: true
		}
	}
};
