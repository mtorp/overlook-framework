// --------------------
// Account namespace controller
// edit action
// --------------------

// libraries
var forms = require('../../../../../lib/forms');

// imports
var defaultActionEdit = require('../../resource/edit');

// exports

// action definition
exports = module.exports = {
	// action params
	actionTypes: {
		form: true
	},

	title: 'Change Account Details',

	// functions

	initForm: function() {
		// make form
		this.form = forms.createFormFromModel(this.route.overlook.models.user, {exclude: ['type', 'isActive']});
	},

	load: function() {
		return this.models.user.find({where: {id: this.user.id}}).bind(this)
		.then(function(user) {
			this.dataMain = this.data.user = user;
		});
	},

	populate: defaultActionEdit.populate,

	act: function() {
		// init actResult
		this.actResult = {};

		// record user id and date
		this.actData.updatedById = this.user.id;
		this.actData.updatedAt = new Date();

		// update db
		return this.dataMain.updateAttributes(this.actData).bind(this)
		.return(true)
		.catch(this.sequelize.UniqueConstraintError, function(err) {
			// unique field not unique
			this.actResult = {error: 'uniqueFail', field: Object.keys(err.fields)[0]};
			return false;
		});
	},

	done: function() {
		return this.redirect('./', 'Saved changes to your account details');
	},

	failed: defaultActionEdit.failed
};
