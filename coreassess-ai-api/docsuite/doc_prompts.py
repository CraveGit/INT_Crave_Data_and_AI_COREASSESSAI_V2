FSD_Prompt= f"""You are an expert in SAP system modernization, Clean Core adherence, and functional specification documentation.

Given the JSON-based , and Markdown document structure with instructions, generate a comprehensive and fully detailed Functional Specification Document that provides complete content in each section, including SAP standard APIs, BTP services, and implementation approaches.
Important Guidelines:
✅ Introduction should be level one heading.
✅ If some info is missing make sure you are saying it is sayin na or null.
✅ Detailed, well-explained content — according to the external context file.
✅ Each functional requirement should have its own heading with two-three  words, be clearly stated in a simplified step, and follow the same formatting as other reruiremnet table in the Markdown file. Include at least 10 requirements.
✅ Detailed, well-explained sections— according to the placeholders.
✅ Detailed, well-explained business benefits with each one as title and explained.
✅ Modernization strategies, such as SAP BTP adoption, API integrations, and CDS Views implementation.
✅ Refactoring and performance optimization, including eliminating direct table access, reducing redundant code, and leveraging ABAP 7.4+ features.
✅ Integration improvements, ensuring compliance with SAP’s Clean Core approach.
✅ List of SAP standard APIs and their implementation approach, including mappings for replacing custom function modules.
✅ BTP services used for extensibility, including deployment strategies and integration methods.
✅ Well-defined acceptance criteria and upgrade readiness strategies to future-proof the system.
✅ Structured tables, bullet points, and technical clarity for readability and usability.

Output Format:
Generate a well-structured Markdown document with proper headings and subheadings.
Use clear, technical, and professional language appropriate for SAP architects and developers.
Include tables for APIs, BTP services, and integration mappings.
Ensure implementation steps are detailed, explaining how each API/service replaces custom logic.
Provide a step-by-step approach for migrating from legacy implementations to SAP-recommended best practices.
Use the JSON analysis provided to tailor recommendations and ensure alignment with SAP’s Clean Core strategy. Your output should be a fully developed Functional Specification Document that can be directly used for implementation.\n""" 


# FSD_Prompt= f"""Generate a detailed functional specification document aligned with SAP’s Keep Core Clean strategy. The document should strictly follow the structure outlined in the provided markdown template and should be based on the analysis in the given JSON file.

# Important Guidelines:
# ✅ Introduction should be level one heading
# ✅ Do NOT add a main heading—it must follow the format given in the markdown template and should start with heading level 1.
# ✅ Use proper numbering and sectioning as per the template.
# ✅ If extra information beyond the JSON analysis is given, categorize it under a new, appropriately numbered section.

# 1. Structured Formatting & Numbering
# Follow the exact heading and subheading structure from the markdown template.

# Ensure that all sections are logically ordered and numbered correctly.

# 2. Requirements
# Each requirement should be clearly categorized and named to enhance readability.

# 2.1 Business & Functional Requirements
# Define the business purpose of the ABAP object.

# Explain the functional scope and how it interacts with SAP modules (e.g., FI, MM, SD).

# Identify user roles, input data, processing logic, and expected outputs.

# 2.2 Technical Requirements
# List SAP standard objects (BAPIs, Function Modules, Tables, CDS Views, APIs) involved.

# Identify custom developments (Reports, Enhancements, User Exits, BADIs).

# Provide details on database interactions, performance considerations, and security aspects.

# 2.3 Keep Core Clean Compliance Requirements
# Ensure that the solution aligns with SAP’s clean-core strategy by minimizing custom code and using standard SAP alternatives.

# Avoid direct table modifications, BDC recordings, and obsolete function modules.

# Recommend CDS views, APIs, SAP Extensibility Framework, or RAP for modernization.

# Ensure future-proofing by maximizing SAP S/4HANA compatibility.

# 3. Content Population from JSON
# Extract object details (e.g., ABAP reports, function modules, BAPIs, enhancements, user exits).

# Identify standard/custom tables, transactions, and dependencies.

# Provide SQL analysis (direct table access, joins, indexes) and suggest replacements if needed.

# Describe runtime behavior, events, and system impact.

# 4. Future Steps & Implementation Guidance
# If future steps are mentioned in the JSON, create a structured roadmap for further implementation.

# Provide SAP best practices to transition custom development to a clean-core architecture.

# Offer a step-by-step guidance on implementing the recommendations in an SAP-compliant manner.

# 5. Final Expectations
# The document must be detailed, structured, and implementation-ready.

# Follow the markdown template precisely without adding or modifying main headings.

# Ensure clear section numbering, logical flow, and distinction between current implementation, analysis, and recommendations.

# """



TSD_Prompt=f""" Generate a detailed and structured technical specification document based on the provided JSON file containing an analysis of an ABAP object. The document should strictly follow the format outlined in the attached markdown template while adhering to SAP's 'Keep Core Clean' strategy.
Key Requirements:
✅ If some info is missing, OMIT that field/row/section entirely. NEVER write "na", "n/a", "null", "none", "TBD", "-" or leave an empty cell/placeholder. Only document fields that are actually present in the JSON, and drop empty rows and empty sections.
Structured Formatting
Ensure proper numbering for headings and subheadings as per the markdown template.
If additional information beyond the given files is provided, include it under a relevant, appropriately numbered section.
SAP 'Keep Core Clean' Alignment
Emphasize modern ABAP development practices, cloud extensibility, and clean core principles.
Recommend SAP-standard alternatives where applicable (e.g., CDS views instead of direct table access, APIs instead of function modules).
Content Population from JSON
Populate relevant sections (e.g., standard/custom tables, function modules, BAPIs, integration details) using the JSON data.
Ensure that technical descriptions are precise and aligned with SAP best practices.
Future Steps & Implementation Guidance
If future steps are mentioned in the JSON or required for implementation, provide a structured section with clear guidance.
Offer best practices for transitioning custom code to a clean core approach.
Comprehensive Coverage
Include assumptions, constraints, dependencies, and integration details.
Document any direct database accesses, recommend SAP-standard APIs, and highlight potential risks.
Ensure completeness by referencing all required components (e.g., business object repository events, configuration details, runtime behavior).
Output Expectations:
The final document should be detailed, well-structured, and implementation-ready.
Ensure clear section numbering, logical flow, and SAP-aligned recommendations.
Use markdown formatting for clarity, as per the provided template.\n"""



BRD_Prompt=f"""You are an expert in SAP system modernization, Clean Core adherence, and Business Blueprint documentation.

Given the JSON-based , and Markdown document structure with instructions, generate a comprehensive and fully detailed Functional Specification Document that provides complete content in each section, including SAP standard APIs, BTP services, and implementation approaches.
Important Guidelines:
✅ FUNCTIONAL OVERVIEW should be level one heading.
✅ Use topics only from provided markdown
✅ If some info is missing make sure you are saying it is sayin na or null.
✅ Detailed, well-explained content — according to the external context file.
✅ Detailed, well-explained sections— according to the placeholders.
✅ Structured tables, bullet points, and technical clarity for readability and usability.

Output Format:
Generate a well-structured Markdown document with proper headings and subheadings.
Use clear, technical, and professional language appropriate for SAP architects and developers.
Use the JSON analysis provided to tailor recommendations and ensure alignment with SAP’s Clean Core strategy. Your output should be a fully developed Business Blueprint Document that can be directly used for implementation.\n""" 

# FSD_Prompt=f"""You are an expert in SAP system modernization, Clean Core adherence, and functional specification documentation.

# Given the JSON-based , and Markdown document structure with instructions, generate a comprehensive and fully detailed Functional Specification Document that provides complete content in each section, including SAP standard APIs, BTP services, and implementation approaches.
# Important Guidelines:
# ✅ Introduction should be level one heading.
# ✅ If some info is missing make sure you are saying it is sayin na or null.
# ✅ Detailed, well-explained content — according to the external context file.
# ✅ Each functional requirement should have its own heading with two-three  words, be clearly stated in a simplified step, and follow the same formatting as other reruiremnet table in the Markdown file. Include all the given 32 requirements.
# ✅ Detailed, well-explained sections— according to the placeholders.
# ✅ Detailed, well-explained business benefits with each one as title and explained.
# ✅ Modernization strategies, such as SAP BTP adoption, API integrations, and CDS Views implementation.
# ✅ Refactoring and performance optimization, including eliminating direct table access, reducing redundant code, and leveraging ABAP 7.4+ features.
# ✅ Integration improvements, ensuring compliance with SAP’s Clean Core approach.
# ✅ List of SAP standard APIs and their implementation approach, including mappings for replacing custom function modules.
# ✅ BTP services used for extensibility, including deployment strategies and integration methods.
# ✅ Well-defined acceptance criteria and upgrade readiness strategies to future-proof the system.
# ✅ Structured tables, bullet points, and technical clarity for readability and usability.

# Output Format:
# Generate a well-structured Markdown document with proper headings and subheadings.
# Use clear, technical, and professional language appropriate for SAP architects and developers.
# Include tables for APIs, BTP services, and integration mappings.
# Ensure implementation steps are detailed, explaining how each API/service replaces custom logic.
# Provide a step-by-step approach for migrating from legacy implementations to SAP-recommended best practices.
# Use the JSON analysis provided to tailor recommendations and ensure alignment with SAP’s Clean Core strategy. Your output should be a fully developed Functional Specification Document that can be directly used for implementation.\n""" 



previous_response=[]
previous_chat_prompts=[]
previous_doctype=[]