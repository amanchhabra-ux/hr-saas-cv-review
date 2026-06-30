import React from "react";
import { Candidate } from "../page";
import { TataCvData, parseTataCv } from "../../lib/cvParser";

interface TataCvPreviewProps {
  candidate: Candidate;
  updateSelected: (changes: Partial<Candidate>) => void;
}

export default function TataCvPreview({ candidate, updateSelected }: TataCvPreviewProps) {
  // Ensure we have fallback data
  const data: TataCvData = candidate.tataData || {
    proposedPosition: "",
    nameOfFirm: "",
    nameOfStaff: candidate.displayName || "",
    dob: "",
    nationality: "Indian",
    education: "",
    membership: "",
    otherTraining: "",
    countries: "India",
    languages: {
      english: { reading: "Excellent", speaking: "Excellent", writing: "Excellent" },
      hindi: { reading: "Good", speaking: "Good", writing: "Good" },
      others: []
    },
    employmentRecordRaw: "",
    employmentRecord: [
      {
        id: "1",
        period: "From ----- to date",
        employer: "TATA Consulting Engineers Limited",
        projects: [
          {
            id: "1-1",
            projectName: "",
            location: "",
            client: "",
            features: "",
            positionHeld: "",
            responsibilities: ""
          }
        ]
      }
    ]
  };

  const updateTata = (changes: Partial<TataCvData>) => {
    updateSelected({
      tataData: {
        ...data,
        ...changes
      }
    });
  };

  const updateLanguage = (langKey: 'english' | 'hindi', field: 'reading' | 'speaking' | 'writing', val: string) => {
    const updatedLang = { ...data.languages };
    updatedLang[langKey] = {
      ...updatedLang[langKey],
      [field]: val
    };
    updateTata({ languages: updatedLang });
  };

  const updateOtherLanguage = (index: number, field: 'name' | 'reading' | 'speaking' | 'writing', val: string) => {
    const updatedOthers = [...data.languages.others];
    updatedOthers[index] = {
      ...updatedOthers[index],
      [field]: val
    };
    updateTata({
      languages: {
        ...data.languages,
        others: updatedOthers
      }
    });
  };

  const addOtherLanguage = () => {
    updateTata({
      languages: {
        ...data.languages,
        others: [...data.languages.others, { name: "", reading: "Good", speaking: "Good", writing: "Good" }]
      }
    });
  };

  const removeOtherLanguage = (index: number) => {
    const updatedOthers = data.languages.others.filter((_, idx) => idx !== index);
    updateTata({
      languages: {
        ...data.languages,
        others: updatedOthers
      }
    });
  };


  return (
    <div className="tataContainer printArea">
      {/* TATA Header */}
      <div className="tataHeader">
        <div className="tataHeaderLeft">
          <strong>TATA CONSULTING ENGINEERS LIMITED</strong>
        </div>
        <div className="tataHeaderRight">
          <span className="tataLogoText">TATA</span>
        </div>
      </div>

      <div className="tataTitle">
        <strong>CURRICULUM VITAE (CV)</strong>
      </div>

      <table className="tataTable">
        <tbody>
          <tr>
            <td className="tataLabelCol">PROPOSED POSITION FOR THIS PROJECT</td>
            <td className="tataValueCol">
              <input
                type="text"
                value={data.proposedPosition}
                onChange={(e) => updateTata({ proposedPosition: e.target.value })}
                placeholder="e.g. Lead Electrical Engineer"
              />
            </td>
          </tr>
          <tr>
            <td className="tataLabelCol">1. NAME OF THE FIRM</td>
            <td className="tataValueCol">
              <input
                type="text"
                value={data.nameOfFirm}
                onChange={(e) => updateTata({ nameOfFirm: e.target.value })}
                placeholder="e.g. TATA Consulting Engineers Limited"
              />
            </td>
          </tr>
          <tr>
            <td className="tataLabelCol">2. NAME OF STAFF</td>
            <td className="tataValueCol">
              <input
                type="text"
                value={data.nameOfStaff}
                onChange={(e) => {
                  updateTata({ nameOfStaff: e.target.value });
                  updateSelected({ displayName: e.target.value });
                }}
                placeholder="Staff Name"
              />
            </td>
          </tr>
          <tr>
            <td className="tataLabelCol">3. DATE OF BIRTH</td>
            <td className="tataValueCol">
              <input
                type="text"
                value={data.dob}
                onChange={(e) => updateTata({ dob: e.target.value })}
                placeholder="DD/MM/YYYY"
              />
            </td>
          </tr>
          <tr>
            <td className="tataLabelCol">4. NATIONALITY</td>
            <td className="tataValueCol">
              <input
                type="text"
                value={data.nationality}
                onChange={(e) => updateTata({ nationality: e.target.value })}
                placeholder="Nationality"
              />
            </td>
          </tr>
          <tr>
            <td className="tataLabelCol">5. EDUCATION</td>
            <td className="tataValueCol">
              <textarea
                value={data.education}
                onChange={(e) => updateTata({ education: e.target.value })}
                placeholder="Degree, Specialization, Institution, Year"
                rows={4}
              />
            </td>
          </tr>
          <tr>
            <td className="tataLabelCol">6. MEMBERSHIP OF PROFESSIONAL SOCIETIES</td>
            <td className="tataValueCol">
              <textarea
                value={data.membership}
                onChange={(e) => updateTata({ membership: e.target.value })}
                placeholder="Professional memberships..."
                rows={2}
              />
            </td>
          </tr>
          <tr>
            <td className="tataLabelCol">7. OTHER TRAINING</td>
            <td className="tataValueCol">
              <textarea
                value={data.otherTraining}
                onChange={(e) => updateTata({ otherTraining: e.target.value })}
                placeholder="Certifications, short courses..."
                rows={3}
              />
            </td>
          </tr>
          <tr>
            <td className="tataLabelCol">8. COUNTRIES OF WORK EXPERIENCE</td>
            <td className="tataValueCol">
              <input
                type="text"
                value={data.countries}
                onChange={(e) => updateTata({ countries: e.target.value })}
                placeholder="e.g. India, UAE"
              />
            </td>
          </tr>
          <tr>
            <td className="tataLabelCol">
              9. LANGUAGES & DEGREE OF PROFICIENCY
            </td>
            <td className="tataValueCol padding0">
              <table className="tataInnerTable">
                <thead>
                  <tr>
                    <th>Language</th>
                    <th>Reading</th>
                    <th>Speaking</th>
                    <th>Writing</th>
                    <th className="noPrint">Action</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>English</strong></td>
                    <td>
                      <select value={data.languages.english.reading} onChange={(e) => updateLanguage('english', 'reading', e.target.value)}>
                        <option value="">-</option>
                        <option value="Excellent">Excellent</option>
                        <option value="Good">Good</option>
                        <option value="Fair">Fair</option>
                      </select>
                    </td>
                    <td>
                      <select value={data.languages.english.speaking} onChange={(e) => updateLanguage('english', 'speaking', e.target.value)}>
                        <option value="">-</option>
                        <option value="Excellent">Excellent</option>
                        <option value="Good">Good</option>
                        <option value="Fair">Fair</option>
                      </select>
                    </td>
                    <td>
                      <select value={data.languages.english.writing} onChange={(e) => updateLanguage('english', 'writing', e.target.value)}>
                        <option value="">-</option>
                        <option value="Excellent">Excellent</option>
                        <option value="Good">Good</option>
                        <option value="Fair">Fair</option>
                      </select>
                    </td>
                    <td className="noPrint"></td>
                  </tr>
                  <tr>
                    <td><strong>Hindi</strong></td>
                    <td>
                      <select value={data.languages.hindi.reading} onChange={(e) => updateLanguage('hindi', 'reading', e.target.value)}>
                        <option value="">-</option>
                        <option value="Excellent">Excellent</option>
                        <option value="Good">Good</option>
                        <option value="Fair">Fair</option>
                      </select>
                    </td>
                    <td>
                      <select value={data.languages.hindi.speaking} onChange={(e) => updateLanguage('hindi', 'speaking', e.target.value)}>
                        <option value="">-</option>
                        <option value="Excellent">Excellent</option>
                        <option value="Good">Good</option>
                        <option value="Fair">Fair</option>
                      </select>
                    </td>
                    <td>
                      <select value={data.languages.hindi.writing} onChange={(e) => updateLanguage('hindi', 'writing', e.target.value)}>
                        <option value="">-</option>
                        <option value="Excellent">Excellent</option>
                        <option value="Good">Good</option>
                        <option value="Fair">Fair</option>
                      </select>
                    </td>
                    <td className="noPrint"></td>
                  </tr>
                  {data.languages.others.map((lang, idx) => (
                    <tr key={idx}>
                      <td>
                        <input
                          type="text"
                          value={lang.name}
                          onChange={(e) => updateOtherLanguage(idx, 'name', e.target.value)}
                          placeholder="Language"
                          style={{ fontWeight: 'bold' }}
                        />
                      </td>
                      <td>
                        <select value={lang.reading} onChange={(e) => updateOtherLanguage(idx, 'reading', e.target.value)}>
                          <option value="">-</option>
                          <option value="Excellent">Excellent</option>
                          <option value="Good">Good</option>
                          <option value="Fair">Fair</option>
                        </select>
                      </td>
                      <td>
                        <select value={lang.speaking} onChange={(e) => updateOtherLanguage(idx, 'speaking', e.target.value)}>
                          <option value="">-</option>
                          <option value="Excellent">Excellent</option>
                          <option value="Good">Good</option>
                          <option value="Fair">Fair</option>
                        </select>
                      </td>
                      <td>
                        <select value={lang.writing} onChange={(e) => updateOtherLanguage(idx, 'writing', e.target.value)}>
                          <option value="">-</option>
                          <option value="Excellent">Excellent</option>
                          <option value="Good">Good</option>
                          <option value="Fair">Fair</option>
                        </select>
                      </td>
                      <td className="noPrint">
                        <button type="button" onClick={() => removeOtherLanguage(idx)} className="tataRowActionBtn">Remove</button>
                      </td>
                    </tr>
                  ))}
                  <tr className="noPrint">
                    <td colSpan={5}>
                      <button type="button" onClick={addOtherLanguage} className="tataAddBtn">+ Add Language</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
          <tr>
            <td className="tataLabelCol">
              10. EXPERIENCE
              <div className="noPrint" style={{ marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Sync experience from CV? This will overwrite the current text in the experience field.")) {
                      const fresh = parseTataCv(candidate.rawText || "", candidate.displayName);
                      updateTata({
                        employmentRecordRaw: fresh.employmentRecordRaw,
                        employmentRecord: fresh.employmentRecord
                      });
                    }
                  }}
                  className="tataAddBtn"
                  style={{ fontSize: '11px', padding: '5px 10px', width: 'auto', display: 'inline-flex', gap: '4px', alignItems: 'center' }}
                >
                  Sync Experience
                </button>
              </div>
            </td>
            <td className="tataValueCol" style={{ padding: '10px' }}>
              <textarea
                value={data.employmentRecordRaw || ""}
                onChange={(e) => updateTata({ employmentRecordRaw: e.target.value })}
                placeholder="Paste the entire Experience / Employment Record section here..."
                style={{ width: '100%', minHeight: '400px', resize: 'vertical', fontSize: '12px', lineHeight: '1.5' }}
              />
            </td>
          </tr>
          <tr>
            <td className="tataLabelCol">11. Certification</td>
            <td className="tataValueCol">
              <p style={{ fontSize: '12px', margin: '0 0 15px 0', lineHeight: '1.4' }}>
                I, the undersigned, certify that to the best of my knowledge and belief, this biodata correctly
                describes myself, my qualifications, and my experience. I understand that any wilful misstatement
                described herein may lead to my disqualification of dismissal, if engaged.
              </p>
              <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div><strong>SIGNATURE:</strong> ___________________________</div>
                <div><strong>NAME:</strong> <span style={{ textDecoration: 'underline' }}>{data.nameOfStaff || 'Staff Name'}</span></div>
                <div><strong>DATE :</strong> <span style={{ textDecoration: 'underline' }}>{new Date().toLocaleDateString()}</span></div>
                <div><strong>PLACE :</strong> ___________________________</div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
