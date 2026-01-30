-- 004_seed_core_facts.sql
-- Populate core_facts with Wikipedia-style multi-paragraph summaries for each topic.
-- Run after 001, 002, and seed.sql. Paragraphs are separated by double newline.

-- Node 1: Welfare eligibility
UPDATE nodes SET core_facts = E'Undocumented immigrants are foreign nationals present in the United States without legal authorization. Under U.S. federal law, eligibility for most federal public benefits is restricted based on immigration status.

The Personal Responsibility and Work Opportunity Reconciliation Act (PRWORA) of 1996 established a distinction between "qualified" and "non-qualified" immigrants for the purpose of federal benefit programs. In general, undocumented immigrants are not eligible for federal means-tested benefits such as Supplemental Security Income (SSI), Temporary Assistance for Needy Families (TANF), Medicaid (with limited exceptions), or food stamps (SNAP).

Certain services remain available regardless of status. The Emergency Medical Treatment and Labor Act (EMTALA) requires hospitals that participate in Medicare to provide emergency care to anyone who needs it, without regard to ability to pay or immigration status. Public K–12 education is guaranteed to all children residing in the United States under the Supreme Court decision in Plyler v. Doe (1982).

State and local governments have discretion to extend additional benefits. Some states provide state-funded health care, in-state tuition, or driver''s licenses to undocumented residents. Eligibility rules therefore vary significantly by jurisdiction and by program.'
WHERE id = '10000000-0000-0000-0000-000000000001';

-- Node 2: CBP encounters
UPDATE nodes SET core_facts = E'U.S. Customs and Border Protection (CBP) is the federal agency within the Department of Homeland Security responsible for securing the nation''s borders and facilitating lawful trade and travel. CBP publishes monthly statistics on "encounters" at and between ports of entry.

An "encounter" is defined by CBP as an event in which a noncitizen is apprehended or deemed inadmissible by CBP personnel. The same individual can be counted more than once if they are encountered in multiple months or in different locations. For example, someone who attempts to cross the border, is expelled or returned, and then attempts again in a later month is counted as multiple encounters.

CBP distinguishes between encounters at ports of entry (e.g., airports, land ports) and those between ports of entry (apprehensions along the border). The statistics do not by themselves indicate how many unique individuals were encountered in a given period. CBP has at times published estimates of "unique individuals" to address this.

Encounter data are used by policymakers, researchers, and the media to describe trends in border enforcement and migration flows. Interpretation of these statistics often depends on whether the focus is on enforcement workload, deterrence, or the number of people seeking to enter the United States.'
WHERE id = '10000000-0000-0000-0000-000000000002';

-- Node 3: Minneapolis ICE protest
UPDATE nodes SET core_facts = E'In 2018, Immigration and Customs Enforcement (ICE) conducted enforcement operations in the Minneapolis–Saint Paul area. ICE is the federal agency responsible for enforcing immigration laws within the United States, including locating and detaining people who are in the country without authorization or who have violated immigration terms.

Community members and advocacy groups organized protests in response. Protesters gathered at or near locations where ICE was believed to be operating, with the stated aim of discouraging arrests or providing support to affected families. Some protests involved blocking access to buildings or vehicles.

The events drew national attention and highlighted tensions between federal immigration enforcement and local communities. Minneapolis had previously considered or adopted policies limiting local law enforcement cooperation with ICE in certain contexts. The protests also raised questions about the scope of ICE''s authority, the role of civil disobedience, and the impact of enforcement on immigrant communities.'
WHERE id = '10000000-0000-0000-0000-000000000003';

-- Node 4: U.S. asylum process
UPDATE nodes SET core_facts = E'Asylum is a form of protection available to individuals who meet the definition of a "refugee" under U.S. law and are physically present in the United States or at a port of entry. The legal framework is set out in the Immigration and Nationality Act (INA) and the Refugee Act of 1980, which incorporated the United Nations Refugee Convention into U.S. law.

To qualify for asylum, an applicant must demonstrate a well-founded fear of persecution on account of race, religion, nationality, membership in a particular social group, or political opinion. The burden of proof is on the applicant. Asylum can be granted by an asylum officer (affirmative asylum) or by an immigration judge in removal proceedings (defensive asylum).

The process typically involves filing an application, being interviewed or appearing in court, and receiving a decision. Backlogs in the immigration court system and in U.S. Citizenship and Immigration Services (USCIS) have led to long wait times. Applicants may be detained or released on parole or bond while their cases are pending, depending on the circumstances.

Approved asylum applicants may apply for lawful permanent residence (a green card) one year after being granted asylum. Denied applicants may be placed in removal proceedings unless they are otherwise authorized to remain.'
WHERE id = '10000000-0000-0000-0000-000000000004';

-- Node 5: Refugee vs asylee
UPDATE nodes SET core_facts = E'Under U.S. law, both "refugees" and "asylees" must meet the same definition of a refugee: a person who is unable or unwilling to return to their country of nationality because of persecution or a well-founded fear of persecution on account of race, religion, nationality, membership in a particular social group, or political opinion. The main difference is where the person is when they apply for protection.

Refugees are processed and admitted from outside the United States. They typically apply through the U.S. Refugee Admissions Program (USRAP), often from a country of first asylum or through a referral from the UN Refugee Agency (UNHCR). They undergo vetting abroad and, if approved, are admitted to the United States with refugee status. The number of refugees admitted each year is subject to a ceiling set by the President in consultation with Congress.

Asylees are people who request asylum after arriving in the United States or at a port of entry. They may have entered with a visa or without inspection. Once asylum is granted, they have similar rights and benefits as refugees, including the ability to work and eventually to apply for lawful permanent residence. There is no annual numerical cap on asylum grants.

Both refugees and asylees may apply for a green card one year after being granted status. The legal standard for protection is the same; the difference is procedural and geographic.'
WHERE id = '10000000-0000-0000-0000-000000000005';
