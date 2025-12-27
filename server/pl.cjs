// save as odoo-db-list.cjs then: node odoo-db-list.cjs
const xmlrpc = require("xmlrpc");

const ODOO_HOST = "keyurtus-3ak.odoo.com";
const ODOO_PATH = "/odoo/xmlrpc/2/db"; // because you're on /odoo

const client = xmlrpc.createSecureClient({
  host: ODOO_HOST,
  port: 443,
  path: ODOO_PATH,
});

client.methodCall("list", [], (err, value) => {
  if (err) {
    console.error("db.list error:", err);
    process.exit(1);
  }
  console.log("Databases:", value);
});
