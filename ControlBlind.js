module.exports = function (RED) {
    const uuid = require('./lib/uuid');
    const axios = require('axios');
    const request = require('request');
    const https = require('https');
    const acc = require('./lib/aes');
    let server;

    const instance = axios.create({
        httpsAgent: new https.Agent({ keepAlive: true })
    });

    sendData = function (data) {
        server.client.send(data, 32100, '238.0.0.18', function (error) {
            console.log('potential error', error);
            if (error) {
                console.log('send failed:' + error);
            }
        });
    };

    controlDevice = function (
        operation,
        targetPosition,
        mac,
        deviceType,
        nodeID
    ) {
        let sendData_obj;
        if (operation !== undefined) {
            sendData_obj = {
                msgType: 'WriteDevice',
                mac: mac,
                deviceType: deviceType,
                AccessToken: acc.generateAcc(server.token, server.key),
                msgID: Date.now() + '' + nodeID,
                data: {
                    operation: operation
                }
            };
        } else if (targetPosition != undefined) {
            sendData_obj = {
                msgType: 'WriteDevice',
                mac: mac,
                deviceType: deviceType,
                AccessToken: acc.generateAcc(server.token, server.key),
                msgID: Date.now() + '' + nodeID,
                data: {
                    targetPosition: targetPosition
                }
            };
        }

        sendData(JSON.stringify(sendData_obj));
    };

    function ControlBlindNode (config) {
        RED.nodes.createNode(this, config);

        var messageBinded = false;
        var nodeID = uuid.generateUUID().substring(0, 6);
        console.log('NodeId: ', nodeID);
        let lastMsgID;

        // Retrieve the config node
        server = RED.nodes.getNode(config.server);
        if (!server) {
            // No config node configured
            this.error(
                'Control Blinds - No API connection was configured. Please add a Connection to this node.'
            );
        }

        var node = this;
        node.on('input', function (msg) {
            let operation = 5;
            let TempTargetPosition;
            if (msg.payload.siro && msg.payload.siro.operation) {
                switch (msg.payload.siro.operation.toUpperCase()) {
                    case 'DOWN':
                        operation = 0;
                        break;
                    case 'UP':
                        operation = 1;
                        break;
                    case 'STOP':
                        operation = 2;
                        break;
                    case 'CHANGE_DIRECTION':
                        operation = 3;
                        break;
                    case 'SET_LIMIT':
                        operation = '4';
                        break;
                    case 'STATUS':
                        operation = '5';
                        break;
                    case 'BATTERY':
                        operation = 6;
                        break;
                    case 'STEP_UP':
                        operation = 7;
                        break;
                    case 'STEP_DOWN':
                        operation = 8;
                        break;
                    case 'SAVE_END_UP':
                        operation = 9;
                        break;
                    case 'SAVE_END_DOWN':
                        operation = 10;
                        break;
                    case 'SAVE_FAV':
                        operation = 11;
                        break;
                    case 'GO_TO_FAV':
                        operation = 12;
                        break;
                    case 'SET_END_UP':
                        operation = 13;
                        break;
                    case 'SET_END_DOWN':
                        operation = 14;
                        break;
                    case 'TARGET_POSITION':
                        operation = 5;
                        TempTargetPosition = msg.payload.siro.targetPosition;
                        break;

                    default:
                        // defaulting to status operation
                        operation = 5;
                        break;
                }
            }

            let device = JSON.parse(config.device);

            if (TempTargetPosition != undefined) {
                operation = undefined;
            }
            controlDevice(
                operation,
                TempTargetPosition,
                device.mac,
                device.type,
                nodeID
            );
        });

        var messageListener = (msg, rinfo) => {
            let obj = JSON.parse(msg.toString());
            let device = JSON.parse(config.device);

            if (
                obj.msgType === 'WriteDeviceAck' &&
                obj.mac == device.mac &&
                (!lastMsgID || lastMsgID < obj.msgID)
            ) {
                lastMsgID = obj.msgID;
                node.send(obj);
            }
        };

        if (!messageBinded) {
            server.client.on('message', messageListener);
            messageBinded = true;
        }

        node.on('close', function (done) {
            server.client.removeListener('message', messageListener);
            done();
        });

        console.log(server.client, messageBinded);
    }
    RED.nodes.registerType('Control-Blind', ControlBlindNode);
};
