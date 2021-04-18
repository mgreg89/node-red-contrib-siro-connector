module.exports = function (RED) {
    const request = require('request');
    const md5 = require('md5');
    const uuid = require('./lib/uuid');
    var schedule = require('node-schedule');
    let connected = null;
    var AccessToken;
    var RefreshToken;
    let SheduleToken;
    let ApiURL;
    let NodeRed;

    function ConnectorConfigNode(n) {
        NodeRed = this;
        this.host = n.host;
        this.port = n.port;
        ApiURL = this.host + ':' + this.port;
        this.user = n.user;
        this.pw = n.pw;
        this.heartbeatTimeout = n.heartbeatTimeout;
        login().then((token) => {
            this.AccessToken = token;
        });
        this.AccessToken = '';
        RED.nodes.createNode(this, n);

        // endpoint for getting siro devices
        RED.httpAdmin.get("/getSiroDevices" + NodeRed.user, RED.auth.needsPermission('sirodevices.read'), function (req, res) {
            ReadDevicesFromServer().then(function (devices) {
                res.json(devices);
            });
        });

        if (!SheduleToken) {
            SheduleToken = schedule.scheduleJob("0 */12 * * *", function () { // token refresh every 12 hours
                refreshToken();
            });
            this.log('Token refresh Shedule added!');
        }
    }
    RED.nodes.registerType("connector-api-config", ConnectorConfigNode);

    async function login() {
        return new Promise((resolve, reject) => {
            request.post({
                url: ApiURL + '/userCenter/user/login',
                form: {
                    loginName: NodeRed.user,
                    password: md5(NodeRed.pw).toUpperCase(),
                    appCode: '92c9c09a-b7b5-4c6c-bbb9-028b761763d9',
                    msgId: uuid.generateUUID().replace(/-/g, '').toUpperCase()
                },
                json: true
            }, function (err, httpResponse, body) {
                if (err) {
                    NodeRed.warn("login called with", this.user);
                    setConnected(false);
                    NodeRed.error('HTTP Request Error: Login failed!');
                    reject();
                    return;
                }
                ReturnCode = body.retCode;
                if (ReturnCode === "20000") {
                    setConnected(true);
                    AccessToken = body.accessToken;
                    RefreshToken = body.refreshToken;
                    UserCode = body.userCode;

                    NodeRed.log('Logged in with Access Token: ' + AccessToken.substr(0, AccessToken.length - 3) + '***');
                    resolve(body.accessToken);
                } else {
                    setConnected(false);
                    NodeRed.log('Login failed. Return Code: ' + ReturnCode);
                    reject();
                }
            });
        });
    }

    function refreshToken() {
        if (connected !== true) {
            NodeRed.log('Token failed. Not Logged in');
            return;
        }

        NodeRed.log('refresh Token...');

        request.post({
            url: ApiURL + '/userCenter/user/refreshToken',
            form: {
                accessToken: AccessToken,
                refreshToken: RefreshToken,
                msgId: uuid.generateUUID().replace(/-/g, '').toUpperCase()
            },
            json: true
        }, function (err, httpResponse, body) {
            if (err) {
                setConnected(false);
                return NodeRed.error('HTTP Request Error: Refresh Token failed!');
            }
            ReturnCode = body.retCode;
            if (ReturnCode === "20000") {
                setConnected(true);
                AccessToken = body.accessToken;
                RefreshToken = body.refreshToken;
                UserCode = body.userCode;
                NodeRed.log('Token refreshed.');
            } else if (ReturnCode === "20108") {
                NodeRed.error('Not Authorized. Login again after Returncode: ' + ReturnCode);
                login();
            } else {
                NodeRed.error('Token refresh failed! Returncode: ' + ReturnCode);
                setConnected(false);
            }
        });
    }

    function setConnected(conn) {
        if (connected !== conn) {
            connected = conn;
            NodeRed.log('Change connection status: ' + conn);
        }

        if (conn && this.heartbeatTimeout) {
            if (connTimeout) {
                clearTimeout(connTimeout);
            }

            connTimeout = setTimeout(disconnected, this.heartbeatTimeout);
        }
    }

    function ReadDevicesFromServer() {
        return new Promise((resolve, reject) => {
            request.post({
                url: ApiURL + '/userCenter/areaService/getAreasWithDevices',
                form: {
                    accessToken: AccessToken,
                    msgId: uuid.generateUUID().replace(/-/g, '').toUpperCase()
                },
                json: true
            }, function (err, httpResponse, body) {
                if (err) {
                    setConnected(false);
                    NodeRed.error('Read Devices failed!');
                    reject('Read Devices failed!');
                    RED.notify("Read Devices failed. Please retry.", "error");
                }
                let devices = new Array();
                ReturnCode = body.retCode;
                if (ReturnCode === "20000") {
                    setConnected(true);
                    NodeRed.debug('Read Devices...');
                    for (let key in body.areas[0].childAreas[0].childAreas) {
                        var obj = body.areas[0].childAreas[0].childAreas[key];

                        for (let key2 in obj.devices) {
                            console.log("obj.devices", obj.devices);
                            let device = obj.devices[key2];
                            devices.push(device);
                        }
                    }
                    resolve(devices);
                } else if (ReturnCode === "20108") {
                    NodeRed.error('Not Authorized. Login again after Returncode: ' + ReturnCode);
                    login();
                    reject('Not Authorized. Login again after Returncode: ' + ReturnCode);
                } else if (ReturnCode === "20001") {
                    NodeRed.log("Server busy");
                    reject("Server busy");
                } else {
                    setConnected(false);
                    reject();
                }
            });
        });
    }
}