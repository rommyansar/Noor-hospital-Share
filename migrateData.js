"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var supabase_js_1 = require("@supabase/supabase-js");
var dotenv = __importStar(require("dotenv"));
dotenv.config({ path: '.env.local' });
var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
var supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
var supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var _a, staff, error, codeCounters, getPrefix, _i, _b, s, parts, prefix, num, _c, _d, s, prefix, newCode, pharmacyDept, pharmDeptId, d, missingStaff, genDept, generalDeptId, d, extendedStaff, _e, extendedStaff_1, s, existing, prefix, newCode;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    console.log('Fetching staff without codes...');
                    return [4 /*yield*/, supabase
                            .from('staff')
                            .select('id, name, department_id, role, staff_code')];
                case 1:
                    _a = _f.sent(), staff = _a.data, error = _a.error;
                    if (error) {
                        console.error('Error fetching staff:', error);
                        return [2 /*return*/];
                    }
                    codeCounters = {
                        'DOC': 1000,
                        'NUR': 1000,
                        'REC': 1000,
                        'SEC': 1000,
                        'HLP': 1000,
                        'PHA': 1000,
                        'TEC': 1000,
                        'OTH': 1000
                    };
                    getPrefix = function (role) {
                        var d = role.toLowerCase();
                        if (d.includes('doctor'))
                            return 'DOC';
                        if (d.includes('nurse'))
                            return 'NUR';
                        if (d.includes('reception'))
                            return 'REC';
                        if (d.includes('security'))
                            return 'SEC';
                        if (d.includes('class') || d.includes('helper') || d.includes('sweeper'))
                            return 'HLP';
                        if (d.includes('pharmacist'))
                            return 'PHA';
                        if (d.includes('technician'))
                            return 'TEC';
                        return 'OTH';
                    };
                    // Find max existing codes to avoid collisions
                    for (_i = 0, _b = staff; _i < _b.length; _i++) {
                        s = _b[_i];
                        if (s.staff_code) {
                            parts = s.staff_code.split('-');
                            if (parts.length === 2) {
                                prefix = parts[0];
                                num = parseInt(parts[1], 10);
                                if (codeCounters[prefix] !== undefined && num >= codeCounters[prefix]) {
                                    codeCounters[prefix] = num + 1;
                                }
                            }
                        }
                    }
                    _c = 0, _d = staff;
                    _f.label = 2;
                case 2:
                    if (!(_c < _d.length)) return [3 /*break*/, 5];
                    s = _d[_c];
                    if (!!s.staff_code) return [3 /*break*/, 4];
                    prefix = getPrefix(s.role);
                    newCode = "".concat(prefix, "-").concat(codeCounters[prefix]++);
                    return [4 /*yield*/, supabase.from('staff').update({ staff_code: newCode }).eq('id', s.id)];
                case 3:
                    _f.sent();
                    console.log("Updated ".concat(s.name, " (").concat(s.role, ") to ").concat(newCode));
                    _f.label = 4;
                case 4:
                    _c++;
                    return [3 /*break*/, 2];
                case 5:
                    console.log('Looking for missing staff...');
                    return [4 /*yield*/, supabase.from('departments').select('id').eq('name', 'Pharmacy').single()];
                case 6:
                    pharmacyDept = (_f.sent()).data;
                    pharmDeptId = pharmacyDept === null || pharmacyDept === void 0 ? void 0 : pharmacyDept.id;
                    if (!!pharmDeptId) return [3 /*break*/, 8];
                    return [4 /*yield*/, supabase.from('departments').insert({ name: 'Pharmacy', is_active: true }).select('id').single()];
                case 7:
                    d = (_f.sent()).data;
                    pharmDeptId = d.id;
                    _f.label = 8;
                case 8:
                    missingStaff = [
                        { name: 'A.Mohsin', role: 'Pharmacist', department_id: pharmDeptId },
                        { name: 'Taufiq Ahmad', role: 'Pharmacist', department_id: pharmDeptId },
                        { name: 'Mahmud Muzammil', role: 'Pharmacist', department_id: pharmDeptId },
                        { name: 'Shujauddin', role: 'Pharmacist', department_id: pharmDeptId },
                        { name: 'A.Rehman', role: 'Pharmacist', department_id: pharmDeptId },
                        { name: 'Syed Mahmood', role: 'Pharmacist', department_id: pharmDeptId },
                        { name: 'T.Saba', role: 'Pharmacist', department_id: pharmDeptId },
                        { name: 'Khadeeja', role: 'Pharmacist', department_id: pharmDeptId },
                        { name: 'Hamda', role: 'Pharmacist', department_id: pharmDeptId },
                        { name: 'Sumeda', role: 'Pharmacist', department_id: pharmDeptId },
                        { name: 'Rofiza', role: 'Pharmacist', department_id: pharmDeptId },
                        { name: 'Fauzia', role: 'Pharmacist', department_id: pharmDeptId },
                        { name: 'Neha Parveen', role: 'Pharmacist', department_id: pharmDeptId },
                        { name: 'Niyamatun Yasmin', role: 'Pharmacist', department_id: pharmDeptId },
                        { name: 'Sameena Munawwar', role: 'Pharmacist', department_id: pharmDeptId },
                        { name: 'Dy.Administrator', role: 'Administrator', department_id: pharmDeptId },
                        { name: 'Accountant', role: 'Accountant', department_id: pharmDeptId },
                        { name: 'Imp.Clerk', role: 'Clerk', department_id: pharmDeptId },
                    ];
                    return [4 /*yield*/, supabase.from('departments').select('id').eq('name', 'General').maybeSingle()];
                case 9:
                    genDept = (_f.sent()).data;
                    generalDeptId = genDept === null || genDept === void 0 ? void 0 : genDept.id;
                    if (!!generalDeptId) return [3 /*break*/, 11];
                    return [4 /*yield*/, supabase.from('departments').insert({ name: 'General', is_active: true }).select('id').single()];
                case 10:
                    d = (_f.sent()).data;
                    generalDeptId = d.id;
                    _f.label = 11;
                case 11:
                    extendedStaff = __spreadArray(__spreadArray([], missingStaff, true), [
                        { name: 'Aziz', role: 'Security Guard', department_id: generalDeptId },
                        { name: 'Haqiqat', role: 'Security Guard', department_id: generalDeptId },
                        { name: 'Lateef', role: 'Security Guard', department_id: generalDeptId },
                        { name: 'Mukhtar', role: 'Security Guard', department_id: generalDeptId },
                        { name: 'Tahir', role: 'Security Guard', department_id: generalDeptId },
                        { name: 'Mubarak', role: 'Security Guard', department_id: generalDeptId },
                        { name: 'Jahangir', role: 'Security Guard', department_id: generalDeptId },
                        { name: 'Imran Arif', role: 'Security Guard', department_id: generalDeptId },
                        { name: 'Irfan Ahmad', role: 'Security Guard', department_id: generalDeptId },
                        { name: 'Wahid', role: 'Security Guard', department_id: generalDeptId },
                        { name: 'Tahir Mumtaz', role: 'Security Guard', department_id: generalDeptId },
                        { name: 'Nizamuddin', role: 'Class IV', department_id: generalDeptId },
                        { name: 'Daroodan', role: 'Class IV', department_id: generalDeptId },
                        { name: 'Quresha', role: 'Class IV', department_id: generalDeptId },
                        { name: 'Seema', role: 'Class IV', department_id: generalDeptId },
                        { name: 'Rekha', role: 'Class IV', department_id: generalDeptId },
                        { name: 'Pammi', role: 'Class IV', department_id: generalDeptId },
                        { name: 'Sunny', role: 'Class IV', department_id: generalDeptId },
                        { name: 'Rishi', role: 'Class IV', department_id: generalDeptId },
                        { name: 'Sajan', role: 'Class IV', department_id: generalDeptId },
                        { name: 'Rajan', role: 'Class IV', department_id: generalDeptId },
                        { name: 'Aneesa', role: 'Class IV', department_id: generalDeptId },
                        { name: 'Rakesh', role: 'Class IV', department_id: generalDeptId },
                        { name: 'Shashi', role: 'Class IV', department_id: generalDeptId },
                        { name: 'Sajid Ali', role: 'Class IV', department_id: generalDeptId },
                        { name: 'Akram', role: 'Class IV', department_id: generalDeptId },
                        { name: 'Gurmeet', role: 'Class IV', department_id: generalDeptId },
                        { name: 'Mansoor', role: 'Driver', department_id: generalDeptId },
                    ], false);
                    _e = 0, extendedStaff_1 = extendedStaff;
                    _f.label = 12;
                case 12:
                    if (!(_e < extendedStaff_1.length)) return [3 /*break*/, 16];
                    s = extendedStaff_1[_e];
                    return [4 /*yield*/, supabase.from('staff').select('id').eq('name', s.name).eq('department_id', s.department_id).maybeSingle()];
                case 13:
                    existing = (_f.sent()).data;
                    if (!!existing) return [3 /*break*/, 15];
                    prefix = getPrefix(s.role);
                    newCode = "".concat(prefix, "-").concat(codeCounters[prefix]++);
                    return [4 /*yield*/, supabase.from('staff').insert({
                            name: s.name,
                            role: s.role,
                            department_id: s.department_id,
                            is_active: true,
                            staff_code: newCode
                        })];
                case 14:
                    _f.sent();
                    console.log("Inserted ".concat(s.name, " (").concat(s.role, ") as ").concat(newCode));
                    _f.label = 15;
                case 15:
                    _e++;
                    return [3 /*break*/, 12];
                case 16:
                    console.log('Migration complete!');
                    return [2 /*return*/];
            }
        });
    });
}
main().catch(console.error);
