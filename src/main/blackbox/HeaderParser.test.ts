import { describe, it, expect } from 'vitest';
import { HeaderParser } from './HeaderParser';
import { StreamReader } from './StreamReader';
import { BBLEncoding, BBLPredictor } from '@shared/types/blackbox.types';

/**
 * Helper to create a StreamReader from header lines.
 * Joins lines with \n and appends a non-header byte so
 * the parser knows where headers end.
 */
function createReader(lines: string[]): StreamReader {
  // Append a frame marker byte 'I' so the parser stops
  const content = lines.join('\n') + '\nI';
  return new StreamReader(Buffer.from(content));
}

describe('HeaderParser', () => {
  describe('basic metadata parsing', () => {
    it('parses product name', () => {
      const reader = createReader([
        'H Product:Blackbox flight data recorder by Nicholas Sherlock',
      ]);
      const header = HeaderParser.parse(reader);
      expect(header.product).toBe('Blackbox flight data recorder by Nicholas Sherlock');
    });

    it('parses data version', () => {
      const reader = createReader([
        'H Data version:2',
      ]);
      const header = HeaderParser.parse(reader);
      expect(header.dataVersion).toBe(2);
    });

    it('parses firmware info', () => {
      const reader = createReader([
        'H Firmware type:Betaflight',
        'H Firmware revision:4.4.2',
        'H Firmware date:May 22 2023 08:13:07',
      ]);
      const header = HeaderParser.parse(reader);
      expect(header.firmwareType).toBe('Betaflight');
      expect(header.firmwareRevision).toBe('4.4.2');
      expect(header.firmwareDate).toBe('May 22 2023 08:13:07');
    });

    it('parses board info and craft name', () => {
      const reader = createReader([
        'H Board information:MAMBAF405US',
        'H Craft name:MyQuad',
      ]);
      const header = HeaderParser.parse(reader);
      expect(header.boardInformation).toBe('MAMBAF405US');
      expect(header.craftName).toBe('MyQuad');
    });

    it('parses log start datetime', () => {
      const reader = createReader([
        'H Log start datetime:2023-08-15T10:30:00.000',
      ]);
      const header = HeaderParser.parse(reader);
      expect(header.logStartDatetime).toBe('2023-08-15T10:30:00.000');
    });
  });

  describe('interval parsing', () => {
    it('parses I interval', () => {
      const reader = createReader([
        'H I interval:32',
      ]);
      const header = HeaderParser.parse(reader);
      expect(header.iInterval).toBe(32);
    });

    it('parses P interval with fraction format', () => {
      const reader = createReader([
        'H P interval:1/2',
      ]);
      const header = HeaderParser.parse(reader);
      expect(header.pInterval).toBe(1);
      expect(header.pDenom).toBe(2);
    });

    it('falls back to P ratio when P interval missing', () => {
      const reader = createReader([
        'H P ratio:4',
      ]);
      const header = HeaderParser.parse(reader);
      expect(header.pInterval).toBe(4);
    });

    it('uses default values when interval headers missing', () => {
      const reader = createReader([
        'H Product:test',
      ]);
      const header = HeaderParser.parse(reader);
      expect(header.iInterval).toBe(32);
      expect(header.pInterval).toBe(1);
      expect(header.pDenom).toBe(1);
    });
  });

  describe('motor/throttle metadata', () => {
    it('parses minthrottle and maxthrottle', () => {
      const reader = createReader([
        'H minthrottle:1070',
        'H maxthrottle:2000',
      ]);
      const header = HeaderParser.parse(reader);
      expect(header.minthrottle).toBe(1070);
      expect(header.maxthrottle).toBe(2000);
    });

    it('parses vbatref', () => {
      const reader = createReader([
        'H vbatref:420',
      ]);
      const header = HeaderParser.parse(reader);
      expect(header.vbatref).toBe(420);
    });

    it('parses looptime', () => {
      const reader = createReader([
        'H looptime:312',
      ]);
      const header = HeaderParser.parse(reader);
      expect(header.looptime).toBe(312);
    });

    it('parses gyro_scale', () => {
      const reader = createReader([
        'H gyro_scale:0.0610352',
      ]);
      const header = HeaderParser.parse(reader);
      expect(header.gyroScale).toBeCloseTo(0.0610352, 5);
    });

    it('parses motorOutput range', () => {
      const reader = createReader([
        'H motorOutput:0,2047',
      ]);
      const header = HeaderParser.parse(reader);
      expect(header.motorOutputRange).toBe(2047);
    });
  });

  describe('field definition parsing', () => {
    it('parses I-frame field definitions', () => {
      const reader = createReader([
        'H Field I name:loopIteration,time,axisP[0],axisP[1],axisP[2]',
        'H Field I signed:0,0,1,1,1',
        'H Field I predictor:0,0,0,0,0',
        'H Field I encoding:1,1,0,0,0',
      ]);
      const header = HeaderParser.parse(reader);
      expect(header.iFieldDefs).toHaveLength(5);
      expect(header.iFieldDefs[0]).toEqual({
        name: 'loopIteration',
        encoding: BBLEncoding.UNSIGNED_VB,
        predictor: BBLPredictor.ZERO,
        signed: false,
      });
      expect(header.iFieldDefs[2]).toEqual({
        name: 'axisP[0]',
        encoding: BBLEncoding.SIGNED_VB,
        predictor: BBLPredictor.ZERO,
        signed: true,
      });
    });

    it('parses P-frame field definitions with non-zero predictors', () => {
      const reader = createReader([
        'H Field P name:loopIteration,time,axisP[0],motor[0]',
        'H Field P signed:0,0,1,0',
        'H Field P predictor:6,2,1,4',
        'H Field P encoding:9,0,0,1',
      ]);
      const header = HeaderParser.parse(reader);
      expect(header.pFieldDefs).toHaveLength(4);
      expect(header.pFieldDefs[0].predictor).toBe(BBLPredictor.INCREMENT);
      expect(header.pFieldDefs[0].encoding).toBe(BBLEncoding.NULL);
      expect(header.pFieldDefs[1].predictor).toBe(BBLPredictor.STRAIGHT_LINE);
      expect(header.pFieldDefs[3].predictor).toBe(BBLPredictor.MINTHROTTLE);
    });

    it('parses S-frame field definitions', () => {
      const reader = createReader([
        'H Field S name:flightModeFlags,stateFlags,failsafePhase',
        'H Field S signed:0,0,0',
        'H Field S predictor:0,0,0',
        'H Field S encoding:1,1,1',
      ]);
      const header = HeaderParser.parse(reader);
      expect(header.sFieldDefs).toHaveLength(3);
      expect(header.sFieldDefs[0].name).toBe('flightModeFlags');
    });

    it('returns empty array when field definitions are missing', () => {
      const reader = createReader([
        'H Product:test',
      ]);
      const header = HeaderParser.parse(reader);
      expect(header.gFieldDefs).toEqual([]);
    });

    it('handles missing encoding/predictor/signed with defaults', () => {
      const reader = createReader([
        'H Field I name:field1,field2',
      ]);
      const header = HeaderParser.parse(reader);
      expect(header.iFieldDefs).toHaveLength(2);
      expect(header.iFieldDefs[0].encoding).toBe(BBLEncoding.SIGNED_VB);
      expect(header.iFieldDefs[0].predictor).toBe(BBLPredictor.ZERO);
      expect(header.iFieldDefs[0].signed).toBe(false);
    });

    it('handles all BF standard encoding types', () => {
      const reader = createReader([
        'H Field I name:f0,f1,f3,f6,f7,f8,f9,f10',
        'H Field I encoding:0,1,3,6,7,8,9,10',
        'H Field I predictor:0,0,0,0,0,0,0,0',
        'H Field I signed:0,0,0,0,0,0,0,0',
      ]);
      const header = HeaderParser.parse(reader);
      expect(header.iFieldDefs[0].encoding).toBe(BBLEncoding.SIGNED_VB);    // 0
      expect(header.iFieldDefs[1].encoding).toBe(BBLEncoding.UNSIGNED_VB);   // 1
      expect(header.iFieldDefs[2].encoding).toBe(BBLEncoding.NEG_14BIT);     // 3
      expect(header.iFieldDefs[3].encoding).toBe(BBLEncoding.TAG8_8SVB);     // 6
      expect(header.iFieldDefs[4].encoding).toBe(BBLEncoding.TAG2_3S32);     // 7
      expect(header.iFieldDefs[5].encoding).toBe(BBLEncoding.TAG8_4S16);     // 8
      expect(header.iFieldDefs[6].encoding).toBe(BBLEncoding.NULL);          // 9
      expect(header.iFieldDefs[7].encoding).toBe(BBLEncoding.TAG2_3SVARIABLE); // 10
    });
  });

  describe('stream positioning', () => {
    it('stops at first non-header line and leaves reader positioned there', () => {
      const buf = Buffer.from('H Product:test\nI');
      const reader = new StreamReader(buf);
      HeaderParser.parse(reader);
      // Reader should be positioned at 'I' byte
      expect(reader.readByte()).toBe(0x49); // 'I'
    });

    it('handles empty buffer', () => {
      const reader = new StreamReader(Buffer.alloc(0));
      const header = HeaderParser.parse(reader);
      expect(header.product).toBe('');
      expect(header.iFieldDefs).toEqual([]);
    });

    it('handles header with no fields', () => {
      const reader = createReader([
        'H Product:Blackbox flight data recorder',
        'H Data version:2',
        'H Firmware type:Betaflight',
      ]);
      const header = HeaderParser.parse(reader);
      expect(header.product).toBe('Blackbox flight data recorder');
      expect(header.firmwareType).toBe('Betaflight');
    });
  });

  describe('rawHeaders', () => {
    it('stores all raw header key-value pairs', () => {
      const reader = createReader([
        'H Product:test',
        'H customKey:customValue',
        'H anotherKey:with:colons:in:value',
      ]);
      const header = HeaderParser.parse(reader);
      expect(header.rawHeaders.get('Product')).toBe('test');
      expect(header.rawHeaders.get('customKey')).toBe('customValue');
      // Only first colon splits key from value
      expect(header.rawHeaders.get('anotherKey')).toBe('with:colons:in:value');
    });
  });

  describe('realistic header', () => {
    it('parses a typical Betaflight 4.4 header', () => {
      const reader = createReader([
        'H Product:Blackbox flight data recorder by Nicholas Sherlock',
        'H Data version:2',
        'H I interval:32',
        'H P interval:1/2',
        'H P ratio:8',
        'H minthrottle:1070',
        'H maxthrottle:2000',
        'H gyro_scale:0x3f800000',
        'H motorOutput:0,2047',
        'H Firmware type:Betaflight',
        'H Firmware revision:BTFL 4.4.2',
        'H Firmware date:Jun 15 2023 07:21:13',
        'H Board information:SPEEDYBEEF405V3',
        'H Log start datetime:2023-08-15T10:30:00.000',
        'H Craft name:FreeStyle5',
        'H looptime:312',
        'H vbatref:420',
        'H Field I name:loopIteration,time,axisP[0],axisP[1],axisP[2],axisI[0],axisI[1],axisI[2],axisD[0],axisD[1],gyroADC[0],gyroADC[1],gyroADC[2],motor[0],motor[1],motor[2],motor[3]',
        'H Field I signed:0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0',
        'H Field I predictor:0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,5,5',
        'H Field I encoding:1,1,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1',
        'H Field P name:loopIteration,time,axisP[0],axisP[1],axisP[2],axisI[0],axisI[1],axisI[2],axisD[0],axisD[1],gyroADC[0],gyroADC[1],gyroADC[2],motor[0],motor[1],motor[2],motor[3]',
        'H Field P signed:0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0',
        'H Field P predictor:6,2,1,1,1,1,1,1,1,1,1,1,1,4,4,4,4',
        'H Field P encoding:9,0,7,7,7,7,7,7,7,7,7,7,7,0,0,0,0',
      ]);
      const header = HeaderParser.parse(reader);

      expect(header.product).toContain('Nicholas Sherlock');
      expect(header.dataVersion).toBe(2);
      expect(header.firmwareType).toBe('Betaflight');
      expect(header.boardInformation).toBe('SPEEDYBEEF405V3');
      expect(header.craftName).toBe('FreeStyle5');
      expect(header.minthrottle).toBe(1070);
      expect(header.looptime).toBe(312);
      expect(header.vbatref).toBe(420);

      // I-frame fields
      expect(header.iFieldDefs).toHaveLength(17);
      expect(header.iFieldDefs[0].name).toBe('loopIteration');
      expect(header.iFieldDefs[13].name).toBe('motor[0]');
      expect(header.iFieldDefs[13].predictor).toBe(BBLPredictor.ZERO);
      expect(header.iFieldDefs[14].predictor).toBe(BBLPredictor.MOTOR_0);

      // P-frame fields
      expect(header.pFieldDefs).toHaveLength(17);
      expect(header.pFieldDefs[0].predictor).toBe(BBLPredictor.INCREMENT);
      expect(header.pFieldDefs[0].encoding).toBe(BBLEncoding.NULL);
      expect(header.pFieldDefs[2].encoding).toBe(BBLEncoding.TAG2_3S32);
      expect(header.pFieldDefs[13].predictor).toBe(BBLPredictor.MINTHROTTLE);
    });
  });
});
