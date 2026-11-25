import { expect } from 'chai';
import 'mocha';
import { buildEnumStates, buildOidGroups, determineStateRole, extractOidIndex, getEnumKeys, padId } from './lib/util';
import {
    buildGetDpSoapBody,
    buildWriteDpSoapBody,
    parseGetDpResponseXml,
    parseOidEnumsXml,
    parseOidNamesXml,
} from './lib/web2commClient';

describe('util functions', () => {
    describe('getEnumKeys', () => {
        it('should extract enum keys from a valid prop string', () => {
            expect(getEnumKeys('-rw enum = 0,1,2')).to.deep.equal(['0', '1', '2']);
        });

        it('should return null when no enum is present', () => {
            expect(getEnumKeys('-rw float')).to.equal(null);
        });
    });

    describe('extractOidIndex', () => {
        it('should extract the trailing index from an OID path', () => {
            expect(extractOidIndex('/1/2/3/5/10')).to.equal('10');
            expect(extractOidIndex('/1/2/3/5/8')).to.equal('8');
        });
    });

    describe('padId', () => {
        it('should pad single-digit IDs with a leading zero', () => {
            expect(padId('1')).to.equal('01');
            expect(padId('12')).to.equal('12');
        });
    });

    describe('determineStateRole', () => {
        it('should assign temperature roles for °C and K', () => {
            expect(determineStateRole('°C', false, false)).to.equal('value.temperature');
            expect(determineStateRole('°C', true, false)).to.equal('level.temperature');
        });

        it('should assign value or level roles appropriately', () => {
            expect(determineStateRole('', false, false)).to.equal('value');
            expect(determineStateRole('', true, false)).to.equal('level');
            expect(determineStateRole('kWh', false, false)).to.equal('value.energy');
        });
    });

    describe('buildEnumStates', () => {
        const enumsDict: Record<string, string[]> = {
            '01:02': ['Off', 'On', 'Auto'],
        };

        it('should build subset of states for Enum Var', () => {
            const states = buildEnumStates({ name: '01:02', desc: 'Enum Var', prop: '-rw enum = 0,2' }, enumsDict);
            expect(states).to.deep.equal({ 0: 'Off', 2: 'Auto' });
        });

        it('should build all states for non-Enum Var', () => {
            const states = buildEnumStates({ name: '01:02', desc: 'Other', prop: '-r-' }, enumsDict);
            expect(states).to.deep.equal({ 0: 'Off', 1: 'On', 2: 'Auto' });
        });

        it('should return undefined if name is not in dictionary', () => {
            const states = buildEnumStates({ name: '99:99', desc: 'Enum Var', prop: '-rw enum = 0' }, enumsDict);
            expect(states).to.equal(undefined);
        });
    });

    describe('buildOidGroups', () => {
        it('should group enabled OIDs by group number', () => {
            const oids: ioBroker.OID[] = [
                { enabled: true, oid: '/1/2/1', name: 'A', isStatus: false, group: 0 },
                { enabled: false, oid: '/1/2/2', name: 'B', isStatus: false, group: 0 },
                { enabled: true, oid: '/1/2/3', name: 'C', isStatus: true, group: 0 },
                { enabled: true, oid: '/1/2/4', name: 'D', isStatus: false, group: 2 },
            ];
            const { oidGroups, groupOidString } = buildOidGroups(oids);
            expect(oidGroups).to.deep.equal({
                0: [0, 2],
                2: [3],
            });
            expect(groupOidString).to.deep.equal({
                0: '/1/2/1;/1/2/3',
                2: '/1/2/4',
            });
        });
    });
});

describe('web2comm XML & SOAP helpers', () => {
    it('should build getDpRequest and writeDpRequest SOAP payloads', () => {
        const getBody = buildGetDpSoapBody('/1/2/3;/1/2/4');
        expect(getBody).to.include('<oid>/1/2/3;/1/2/4</oid>');

        const writeBody = buildWriteDpSoapBody('/1/2/15', 21.5);
        expect(writeBody).to.include('<oid>/1/2/15</oid>');
        expect(writeBody).to.include('<index>15</index>');
        expect(writeBody).to.include('<value>21.5</value>');
    });

    it('should parse VarIdentTexte XML into OID names dictionary', async () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <VarIdentTexte>
            <gn id="1">
                <mn id="2">Außentemperatur</mn>
                <mn id="12">Vorlauftemperatur</mn>
            </gn>
        </VarIdentTexte>`;
        const dict = await parseOidNamesXml(xml);
        expect(dict).to.deep.equal({
            '01:02': 'Außentemperatur',
            '01:12': 'Vorlauftemperatur',
        });
    });

    it('should parse AufzaehlTexte XML into OID enums dictionary', async () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <AufzaehlTexte>
            <gn id="1">
                <mn id="5">
                    <enum id="0">Aus</enum>
                    <enum id="1">Ein</enum>
                </mn>
            </gn>
        </AufzaehlTexte>`;
        const dict = await parseOidEnumsXml(xml);
        expect(dict).to.deep.equal({
            '01:05': ['Aus', 'Ein'],
        });
    });

    it('should parse SOAP getDpResponse XML into OchsnerDataPoint items', async () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns="http://ws01.lom.ch/soap/">
            <SOAP-ENV:Body>
                <ns:getDpResponse>
                    <dpCfg>
                        <name>01:02</name>
                        <prop>-rw</prop>
                        <desc>Temp</desc>
                        <value>22.5</value>
                        <unit>°C</unit>
                        <step>0.5</step>
                        <minValue>10</minValue>
                        <maxValue>30</maxValue>
                    </dpCfg>
                </ns:getDpResponse>
            </SOAP-ENV:Body>
        </SOAP-ENV:Envelope>`;
        const points = await parseGetDpResponseXml(xml);
        expect(points).to.have.lengthOf(1);
        expect(points[0]).to.deep.equal({
            name: '01:02',
            prop: '-rw',
            desc: 'Temp',
            value: '22.5',
            unit: '°C',
            step: '0.5',
            min: '10',
            max: '30',
        });
    });
});
