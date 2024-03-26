![Logo](admin/ochsner_logo.svg)

# ioBroker.ochsner-roomterminal

[![NPM version](https://img.shields.io/npm/v/iobroker.ochsner-roomterminal.svg)](https://www.npmjs.com/package/iobroker.ochsner-roomterminal)
[![Downloads](https://img.shields.io/npm/dm/iobroker.ochsner-roomterminal.svg)](https://www.npmjs.com/package/iobroker.ochsner-roomterminal)
![Number of Installations](https://iobroker.live/badges/ochsner-roomterminal-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/ochsner-roomterminal-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.ochsner-roomterminal.png?downloads=true)](https://nodei.co/npm/iobroker.ochsner-roomterminal/)

## ochsner-roomterminal Adapter for ioBroker

### Description

This adapter connects to the Ochsner Roomterminal Webserver (web2comm) via SOAP, to both monitor and control your OCHSNER heatpump system.
It offers almost the same _devices and functions_ features to ioBroker, which are available when you access the Roomterminal's web2comm interface with you browser.

During adapter startup, meta data like names, min/max values, units, etc. are read from the roomterminal and used during object creation. However, valid values are neither enforced by the adapter, nor by the web2com interface. It is for information only, and e.g. iobroker provides you with a log entry, when e.g. values are not within the given range.

OIDs are read in **groups**, which means all ochsner endpoints, which belong to same group, are read in one request (simultaneously). A specific group is identified via a positive integer number.

If you intent to change/update the value of a given endpoint, you have to configure the endpoint to be a **state**.

Group reads can be triggered in 2 ways:

1. **Via Polling:** <br>
   Groups identified with numbers from 0 to 9 are read in a round robin fashion - one after the other. The time between 2 group reads is specified via the polling intervall in seconds.
2. Via **ioBroker Message:**<br>
   Any group read can be triggered via a readGroup iobroker message, which is sent to the adapter instace.

### OID - Address of a device endpoint

All OIDs can be derived from the web2com web page.

![web2comm](admin/web2comm.png)

E.g <code>/1/2/7/106/1</code> specifies the _Normal setpoint DWH temperature_ on my heatpump.

> Since OIDs are hierachical, it is recommended to use only OIDs which specifiy only one device endpoint. You can also use one level above (e.g. <code>/1/2/7/106</code>), which read all endpoints below.<br> However, this feature is not tested!.

### Instance Configuration

#### Options Tab

Here you can provide <code>username</code>, <code>password</code> and <code>IP or hostame</code> of your web2com web interface,
as well as the <code>polling interval</code>, which specifies the time in seconds between subsequent group reads

#### OID Tab

Here you can create and modify a table of OID endpoints.

Each table entry has the followin fields:
| Field Name | Description |
| :--- | :---- |  
| Enabled | Only enabled endpoints can be read or updated |
| OID | Address of the device endpoint to read or update |
| Name | Name of the device endpoint to read or update |
| is state | indicates, that you intent to update the device endpoint |
| Group | group identfier (positive integer number) of the endpoint |

### ioBroker Instance Messages

The adapter supports sending a <code>readGroup</code> message, in order to trigger a **group read request**, either from the cmd line - or - from script.
This allows to get in-time information, whenever you need them.

#### E.g. read all endpoints, which belong to group 15 ...

1. From command line: `iobroker message ochsner-roomterminal.0 readGroup 15`<br>
2. From javascript: `await sendToAsync("ochsner-roomterminal.0", 'readGroup', '15');`
3. From blockly: <br>![blockly](admin/blockly.png)

### Important Hints

> 1.  This adapter is based on the reverse engineering results on my heatpump. It works on my device and my endpoint configuration since 2 years.
> 2.  **I had to add a group with only one OID**, in order to avoid a situation, when the web2comm interface suddenly stopped providing data back.
> 3.  There were no test executed on any other endpoints or any other ochsner heatpump. So enjoy to give it a try with your endpoints on your device :blush: - and don't forget to perform the required tests in your environment
> 4.  The web2comm interface does not give any error codes back, when reading or writing to endpoints, which do not exist.
>     So check that your OIDs are provided correctly and supported by your ochsner heatpump.

## Changelog

<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->

### **WORK IN PROGRESS**

-   added initial description in README.md
-   provide correct index when writing OIDs

### 0.0.8 (2023-08-24)

-   removed React components
-   NPM packages updates

### 0.0.7 (2023-06-11)

-   updated the newest npm packages

### 0.0.6 (2023-05-20)

-   updated vulnerable packages

### 0.0.5 (2023-03-15)

-   async message support

### 0.0.4 (2023-03-07)

-   groups with names bigger than 9 are reserved for messages

### 0.0.3 (2023-03-07)

-   added message support to trigger group reads

### 0.0.2 (2023-02-18)

-   fixed problem with only having one group

### 0.0.1 (2023-02-16)

-   (armintan) initial release

## License

MIT License

Copyright (c) 2023 Armin Stegerer <Armin.Stegerer@t-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
